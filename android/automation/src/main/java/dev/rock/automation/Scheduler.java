package dev.rock.automation;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class Scheduler {
    static final int ID = 4101;
    static void schedule(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs.getPendingJob(ID) != null) return;
        JobInfo job = new JobInfo.Builder(ID, new ComponentName(context, AutomationJobService.class))
            .setRequiresCharging(true).setPersisted(true).setPeriodic(15 * 60_000L)
            .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();
        if (jobs.schedule(job) != JobScheduler.RESULT_SUCCESS) throw new IllegalStateException("SCHEDULER_REJECTED");
    }
    static void stop(Context context) { context.getSystemService(JobScheduler.class).cancel(ID); }
}
