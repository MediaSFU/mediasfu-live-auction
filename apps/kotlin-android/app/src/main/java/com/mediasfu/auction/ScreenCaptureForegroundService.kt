package com.mediasfu.auction

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.*
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout

class ScreenCaptureForegroundService : Service() {
    override fun onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("auction_screen_share","Screen sharing",NotificationManager.IMPORTANCE_LOW))}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{startForeground(4108,NotificationCompat.Builder(this,"auction_screen_share").setSmallIcon(R.drawable.ic_launcher).setContentTitle("Sharing your auction screen").setContentText("Return to the auction to stop sharing.").setOngoing(true).build());running=true;return START_NOT_STICKY}
    override fun onDestroy(){running=false;super.onDestroy()}
    override fun onBind(intent:Intent?):IBinder?=null
    companion object { @Volatile private var running=false; suspend fun start(context:Context){val intent=Intent(context.applicationContext,ScreenCaptureForegroundService::class.java);if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O)context.startForegroundService(intent)else context.startService(intent);withTimeout(3000){while(!running)delay(16)}};fun stop(context:Context){context.stopService(Intent(context,ScreenCaptureForegroundService::class.java));running=false} }
}
