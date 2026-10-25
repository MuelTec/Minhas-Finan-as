package com.minhasfinancas.app;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Leitor nativo de notificações (Android).
 * Captura notificações de banco/SMS que contenham valores em R$
 * e as enfileira para o app importar automaticamente.
 */
public class NotifListenerService extends NotificationListenerService {

    public static final String PREFS = "fin_notif";
    public static final String KEY_QUEUE = "queue";
    public static final String KEY_LAST = "last";
    public static final int MAX_QUEUE = 30;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;
            // Ignora notificações do próprio app
            if (getPackageName().equals(sbn.getPackageName())) return;

            Notification n = sbn.getNotification();
            if (n.extras == null) return;

            CharSequence csTitle = n.extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence csText = n.extras.getCharSequence(Notification.EXTRA_TEXT);
            if (csText == null) csText = n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

            String title = csTitle == null ? "" : csTitle.toString();
            String text = csText == null ? "" : csText.toString();
            String combined = title.length() > 0 && !text.contains(title) ? title + " - " + text : text;
            combined = combined.replaceAll("\\s+", " ").trim();

            // Só interessam notificações com valor em reais
            if (combined.length() < 5 || !combined.contains("R$")) return;

            SharedPreferences sp = getSharedPreferences(PREFS, MODE_PRIVATE);
            // Evita duplicar a mesma notificação
            if (combined.equals(sp.getString(KEY_LAST, ""))) return;

            JSONArray arr;
            try {
                arr = new JSONArray(sp.getString(KEY_QUEUE, "[]"));
            } catch (Exception e) {
                arr = new JSONArray();
            }
            JSONObject o = new JSONObject();
            o.put("text", combined);
            o.put("pkg", sbn.getPackageName());
            o.put("ts", System.currentTimeMillis());
            arr.put(o);
            while (arr.length() > MAX_QUEUE) arr.remove(0);

            sp.edit().putString(KEY_QUEUE, arr.toString()).putString(KEY_LAST, combined).apply();
        } catch (Throwable ignored) {
        }
    }

    /** Devolve a fila pendente e limpa (chamado pelo app). */
    public static JSONArray takeQueue(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY_QUEUE, "[]");
            sp.edit().remove(KEY_QUEUE).apply();
            return new JSONArray(raw);
        } catch (Throwable t) {
            return new JSONArray();
        }
    }

    /** Verifica se o usuário concedeu acesso a notificações a este app. */
    public static boolean isListening(Context ctx) {
        try {
            String flat = Settings.Secure.getString(
                    ctx.getContentResolver(), "enabled_notification_listeners");
            if (flat == null || flat.length() == 0) return false;
            String comp = new ComponentName(ctx, NotifListenerService.class).flattenToString();
            return flat.contains(comp) || flat.contains(NotifListenerService.class.getName());
        } catch (Throwable t) {
            return false;
        }
    }
}
