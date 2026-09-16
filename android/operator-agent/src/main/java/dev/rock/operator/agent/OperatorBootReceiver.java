package dev.rock.operator.agent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class OperatorBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        OperatorAgentScheduler.schedule(context, 5_000L);
    }
}
