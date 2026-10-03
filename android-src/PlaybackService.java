package com.duskfall.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

/** Keeps playback alive in the background and shows the media notification / lock-screen controls. */
public class PlaybackService extends Service {
    static final String CH = "duskfall_playback";
    static String title = "", artist = "";
    static boolean playing = false;
    static long pos = 0, dur = 0;
    static Bitmap cover = null;
    private MediaSession session;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Playback", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
        session = new MediaSession(this, "Duskfall");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MusicLibraryPlugin.emit("play", 0); }
            @Override public void onPause() { MusicLibraryPlugin.emit("pause", 0); }
            @Override public void onSkipToNext() { MusicLibraryPlugin.emit("next", 0); }
            @Override public void onSkipToPrevious() { MusicLibraryPlugin.emit("prev", 0); }
            @Override public void onSeekTo(long p) { MusicLibraryPlugin.emit("seek", p / 1000.0); }
        });
        session.setActive(true);
    }

    private PendingIntent act(String a) {
        Intent i = new Intent(this, PlaybackService.class).setAction(a);
        int f = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getService(this, 0, i, f);
    }

    private Notification build() {
        long acts = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder().setActions(acts)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? 1f : 0f).build());
        MediaMetadata.Builder mb = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        if (cover != null) mb.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, cover);
        session.setMetadata(mb.build());

        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int f = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        nb.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title).setContentText(artist).setLargeIcon(cover)
            .setVisibility(Notification.VISIBILITY_PUBLIC).setShowWhen(false)
            .setContentIntent(PendingIntent.getActivity(this, 0, launch, f))
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", act("prev")).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", act("toggle")).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", act("next")).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Close", act("stop")).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return nb.build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String a = intent == null ? null : intent.getAction();
        if ("stop".equals(a)) {
            MusicLibraryPlugin.emit("pause", 0);
            stopForeground(true);
            stopSelf();
        } else if (a != null && !"update".equals(a)) {
            MusicLibraryPlugin.emit(a, 0); // prev | toggle | next
        }
        if (a == null || "update".equals(a)) {
            Notification n = build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(1, n);
        }
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onDestroy() {
        if (session != null) session.release();
        super.onDestroy();
    }
}
