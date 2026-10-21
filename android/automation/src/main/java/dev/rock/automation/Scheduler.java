package dev.rock.automation;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class Scheduler {
    static final int ID = 4101;
    static final int IMMEDIATE_ID = 4102;
    static final int CONTINUATION_ID = 4103;
    static void schedule(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        ComponentName service = new ComponentName(context, AutomationJobService.class);
        if (jobs.getPendingJob(ID) == null) {
            JobInfo periodic = new JobInfo.Builder(ID, service)
                .setRequiresCharging(true).setPersisted(true).setPeriodic(15 * 60_000L)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();
            if (jobs.schedule(periodic) != JobScheduler.RESULT_SUCCESS) throw new IllegalStateException("SCHEDULER_REJECTED");
        }
        // A user submission should not wait for the periodic maintenance window.
        // Charging, thermal checks, Engine pause/lease and finite Tool limits still apply.
        if (jobs.getPendingJob(IMMEDIATE_ID) == null) {
            JobInfo immediate = new JobInfo.Builder(IMMEDIATE_ID, service)
                .setRequiresCharging(true).setPersisted(true)
                .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();
            if (jobs.schedule(immediate) != JobScheduler.RESULT_SUCCESS) throw new IllegalStateException("SCHEDULER_REJECTED");
        }
    }
    /** Healthy finite batches continue as a fresh job, without failure backoff. */
    static void continueWork(Context context,int completedJobId) {
        if(((RockApplication)context.getApplicationContext()).engine().paused())return;
        JobScheduler jobs=context.getSystemService(JobScheduler.class);
        int next=completedJobId==IMMEDIATE_ID?CONTINUATION_ID:IMMEDIATE_ID;
        if(jobs.getPendingJob(next)==null) {
            JobInfo job=new JobInfo.Builder(next,new ComponentName(context,AutomationJobService.class))
                .setRequiresCharging(true).setPersisted(true)
                .setBackoffCriteria(30_000,JobInfo.BACKOFF_POLICY_EXPONENTIAL).build();
            if(jobs.schedule(job)!=JobScheduler.RESULT_SUCCESS)throw new IllegalStateException("SCHEDULER_REJECTED");
        }
    }
    static void stop(Context context) {
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        jobs.cancel(ID); jobs.cancel(IMMEDIATE_ID); jobs.cancel(CONTINUATION_ID);
    }
}
