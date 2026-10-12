package dev.rock.operator.agent;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class OperatorAgentScheduler {
    private static final int JOB_ID = 0x41564f;

    static void schedule(Context context, long delayMillis) {
        JobInfo job = new JobInfo.Builder(JOB_ID,
                new ComponentName(context, OperatorAgentJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(Math.max(1_000L, delayMillis))
                .setOverrideDeadline(Math.max(60_000L, delayMillis * 2))
                .setPersisted(true)
                .build();
        context.getSystemService(JobScheduler.class).schedule(job);
    }

    private OperatorAgentScheduler() { }
}
