package com.minhasfinancas.app;

import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

/**
 * Activity principal (Capacitor) com ponte nativa para o app web:
 * - AndroidBridge.takeQueue()            -> notificações pendentes (JSON)
 * - AndroidBridge.isListenerEnabled()    -> acesso a notificações ativo?
 * - AndroidBridge.openNotificationSettings() -> abre as configurações do Android
 */
public class MainActivity extends BridgeActivity {

    private boolean bridgeAdded = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ensureBridge();
    }

    @Override
    protected void onResume() {
        super.onResume();
        ensureBridge();
    }

    private void ensureBridge() {
        try {
            if (!bridgeAdded && bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().addJavascriptInterface(new NotifBridge(), "AndroidBridge");
                bridgeAdded = true;
            }
        } catch (Throwable ignored) {
        }
    }

    public class NotifBridge {

        @JavascriptInterface
        public String takeQueue() {
            try {
                return NotifListenerService.takeQueue(getApplicationContext()).toString();
            } catch (Throwable t) {
                return "[]";
            }
        }

        @JavascriptInterface
        public boolean isListenerEnabled() {
            try {
                return NotifListenerService.isListening(getApplicationContext());
            } catch (Throwable t) {
                return false;
            }
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            try {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } catch (Throwable t) {
                try {
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
                } catch (Throwable ignored) {
                }
            }
        }
    }
}
