package dev.rock.operator.agent;

import android.app.job.JobParameters;
import android.app.job.JobService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;

public final class OperatorAgentJobService extends JobService {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override public boolean onStartJob(JobParameters parameters) {
        executor.execute(() -> {
            long next = 60_000L;
            try {
                OperatorAgentConfig config = OperatorAgentConfig.load(this);
                if (!config.isConfigured()) {
                    next = 21_600_000L;
                } else {
                    runOnce(config);
                }
            } catch (Exception ignored) {
                next = 300_000L;
            } finally {
                OperatorAgentScheduler.schedule(this, next);
                jobFinished(parameters, false);
            }
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters parameters) { return true; }

    private void runOnce(OperatorAgentConfig config) throws Exception {
        DeviceIdentity identity = new DeviceIdentity(config.hardwareIdentityRequired,
                config.deviceAttestationChallenge);
        OperatorDockClient client = new OperatorDockClient(config, identity);
        OperatorAgentDatabase database = new OperatorAgentDatabase(this);
        OperatorCommandVerifier verifier = new OperatorCommandVerifier(config, System::currentTimeMillis);
        OperatorCommandExecutor commandExecutor = new OperatorCommandExecutor(this, config);
        long now = System.currentTimeMillis();
        commandExecutor.clearExpiredMaintenance(now);
        JSONArray commands = client.poll();
        Set<String> activeCommandIds = new HashSet<>();
        for (int index = 0; index < commands.length(); index++) {
            String id = commands.optJSONObject(index) == null ? ""
                    : commands.optJSONObject(index).optString("id", "");
            if (!id.isEmpty()) activeCommandIds.add(id);
        }
        commandExecutor.reconcileFactoryResetWarning(activeCommandIds);
        for (int index = 0; index < commands.length(); index++) {
            try {
                SignedOperatorCommand command = SignedOperatorCommand.parse(commands.getJSONObject(index));
                process(command, identity, client, database, verifier, commandExecutor);
            } catch (Exception ignored) {
                // A malformed or unauthorized command remains unacknowledged and expires server-side.
            }
        }
        database.close();
    }

    private static void process(SignedOperatorCommand command, DeviceIdentity identity,
                                OperatorDockClient client, OperatorAgentDatabase database,
                                OperatorCommandVerifier verifier,
                                OperatorCommandExecutor executor) throws Exception {
        String state = database.state(command.id);
        if (state == null) {
            OperatorCommandVerifier.Verified verified = verifier.verify(command, identity.deviceId());
            database.stageVerified(command, verified, System.currentTimeMillis());
            state = database.state(command.id);
        } else if (!database.payloadMatches(command.id,
                OperatorCommandVerifier.payloadSha256(command))) {
            throw new SecurityException("Previously verified command changed");
        }

        long now = System.currentTimeMillis();
        if (now < command.notBefore) {
            executor.showPreExecutionWarning(command);
            return;
        }
        if ("verified".equals(state)) {
            client.acknowledge(command.id);
            database.markAcknowledged(command.id, now);
            state = "acknowledged";
        }
        if ("acknowledged".equals(state)) {
            OperatorCommandExecutor.Result result = executor.execute(command, now);
            database.markResult(command.id, result.status, result.code, result.details, now);
        }
        OperatorAgentDatabase.StoredResult result = database.storedResult(command.id);
        if (result != null && !result.reported) {
            executor.showPostIncident(command, result);
            client.result(command.id, result.status, result.resultCode, result.details);
            database.markReported(command.id, System.currentTimeMillis());
            if (command.action.equals("request_factory_reset")
                    && result.status.equals("completed")
                    && result.resultCode.equals("FACTORY_RESET_ACCEPTED"))
                executor.performAcceptedFactoryReset();
        }
    }
}
