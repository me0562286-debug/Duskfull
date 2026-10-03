package com.duskfall.player;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "MusicLibrary", permissions = {
    @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
    @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
    @Permission(alias = "notif", strings = { "android.permission.POST_NOTIFICATIONS" })
})
public class MusicLibraryPlugin extends Plugin {
    private String alias() { return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage"; }

    static MusicLibraryPlugin inst;

    @Override
    public void load() { inst = this; }

    /** Sends a notification/lock-screen/headset button press to the web player. */
    static void emit(String action, double position) {
        if (inst == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        o.put("position", position);
        inst.notifyListeners("mediaAction", o);
    }

    @PluginMethod
    public void update(PluginCall call) {
        PlaybackService.title = call.getString("title", "");
        PlaybackService.artist = call.getString("artist", "");
        PlaybackService.playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        PlaybackService.pos = (long) (call.getDouble("position", 0.0) * 1000);
        PlaybackService.dur = (long) (call.getDouble("duration", 0.0) * 1000);
        String c = call.getString("cover", "");
        PlaybackService.cover = null;
        if (c != null && c.contains(",")) {
            try {
                byte[] b = Base64.decode(c.substring(c.indexOf(',') + 1), Base64.DEFAULT);
                PlaybackService.cover = BitmapFactory.decodeByteArray(b, 0, b.length);
            } catch (Exception ignored) { }
        }
        Intent i = new Intent(getContext(), PlaybackService.class).setAction("update");
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
        } catch (Exception ignored) { }
        call.resolve();
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            String[] want = Build.VERSION.SDK_INT >= 33 ? new String[] { alias(), "notif" } : new String[] { alias() };
            requestPermissionForAliases(want, call, "permDone");
            return;
        }
        doScan(call);
    }

    @PermissionCallback
    private void permDone(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) doScan(call);
        else call.reject("denied");
    }

    private void doScan(PluginCall call) {
        JSArray arr = new JSArray();
        Uri base = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] proj = { MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DURATION };
        // every audio file (songs, recordings, downloads) except ringtones/alarms/notifications
        String sel = MediaStore.Audio.Media.IS_RINGTONE + "=0 AND " + MediaStore.Audio.Media.IS_NOTIFICATION + "=0 AND "
            + MediaStore.Audio.Media.IS_ALARM + "=0";
        try (Cursor c = getContext().getContentResolver().query(base, proj, sel, null, MediaStore.Audio.Media.DATE_ADDED + " ASC")) {
            while (c != null && c.moveToNext()) {
                long id = c.getLong(0);
                String artist = c.getString(2);
                if (artist == null || artist.equals("<unknown>")) artist = "";
                JSObject o = new JSObject();
                o.put("id", String.valueOf(id));
                o.put("title", c.getString(1));
                o.put("artist", artist);
                o.put("album", c.getString(3));
                o.put("added", c.getLong(4) * 1000L);
                o.put("duration", c.getLong(5) / 1000.0);
                o.put("uri", ContentUris.withAppendedId(base, id).toString());
                arr.put(o);
            }
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
            return;
        }
        JSObject r = new JSObject();
        r.put("tracks", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void cover(PluginCall call) {
        String u = call.getString("uri");
        JSObject r = new JSObject();
        r.put("data", "");
        if (u != null && Build.VERSION.SDK_INT >= 29) {
            try {
                Bitmap b = getContext().getContentResolver().loadThumbnail(Uri.parse(u), new Size(480, 480), null);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.JPEG, 82, bo);
                r.put("data", "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
            } catch (Exception ignored) { }
        }
        call.resolve(r);
    }
}
