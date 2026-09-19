package com.wakz.status;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.RouteInfo;

/**
 * Wakz Android shell.
 *
 * The dashboard, the collector, the status engine and the cache all run inside the WebView on the
 * device itself; the app talks to service sources directly. A server address can be configured in
 * the app settings, but it is never required.
 */
public class MainActivity extends Activity {

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.parseColor("#07080D"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);

        // Trusted local assets that must reach the status APIs of the tracked services directly.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file://")) {
                    return false;
                }
                // Vendor status pages and homepages open in the system browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    // No browser available: stay in the app.
                }
                return true;
            }
        });

        // Bridges the DNS/PING tools to the device: real ICMP ping through the system binary.
        webView.addJavascriptInterface(new NativeBridge(this, webView), "WakzNative");

        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");

        startEngineService();
        requestNotificationPermission();
    }

    /** Keeps the local engine running while the app is in the background. */
    private void startEngineService() {
        Intent intent = new Intent(this, EngineService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1001);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) {
            stopService(new Intent(this, EngineService.class));
            if (webView != null) {
                webView.destroy();
                webView = null;
            }
        }
        super.onDestroy();
    }

    /** JavaScript bridge exposed as window.WakzNative. */
    public static class NativeBridge {

        private static final Pattern TIME_PATTERN = Pattern.compile("time[=<]([0-9.]+)\\s*ms", Pattern.CASE_INSENSITIVE);
        private static final Pattern LOSS_PATTERN = Pattern.compile("([0-9.]+)%\\s*packet loss", Pattern.CASE_INSENSITIVE);
        private static final Pattern HOST_PATTERN = Pattern.compile("[A-Za-z0-9._:\\-]{3,253}");

        private final MainActivity activity;
        private final WebView webView;

        NativeBridge(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public boolean available() {
            return true;
        }

        /**
         * Returns the device's own IPv4 addresses (with prefix length) and the default gateway so the
         * web layer can look for a Wakz server on the local network. No location permission is used.
         */
        @JavascriptInterface
        public String localNetworkInfo() {
            try {
                JSONArray interfaces = new JSONArray();
                List<NetworkInterface> networkInterfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
                for (NetworkInterface networkInterface : networkInterfaces) {
                    if (networkInterface.isLoopback() || !networkInterface.isUp()) continue;
                    for (InterfaceAddress interfaceAddress : networkInterface.getInterfaceAddresses()) {
                        InetAddress address = interfaceAddress.getAddress();
                        if (!(address instanceof Inet4Address) || address.isLoopbackAddress() || address.isLinkLocalAddress()) {
                            continue;
                        }
                        JSONObject entry = new JSONObject();
                        entry.put("name", networkInterface.getName());
                        entry.put("ip", address.getHostAddress());
                        entry.put("prefix", interfaceAddress.getNetworkPrefixLength());
                        interfaces.put(entry);
                    }
                }

                String gateway = null;
                ConnectivityManager manager = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (manager != null) {
                    Network active = manager.getActiveNetwork();
                    LinkProperties properties = active == null ? null : manager.getLinkProperties(active);
                    if (properties != null) {
                        for (RouteInfo route : properties.getRoutes()) {
                            if (!route.isDefaultRoute()) continue;
                            InetAddress candidate = route.getGateway();
                            if (candidate instanceof Inet4Address) {
                                gateway = candidate.getHostAddress();
                                break;
                            }
                        }
                    }
                }

                JSONObject json = new JSONObject();
                json.put("available", true);
                json.put("interfaces", interfaces);
                json.put("gateway", gateway == null ? JSONObject.NULL : gateway);
                return json.toString();
            } catch (Exception exception) {
                return "{\"available\":false,\"error\":\"" + exception.getClass().getSimpleName() + "\"}";
            }
        }

        @JavascriptInterface
        public void startPing(final String host, final int requestedCount, final String callbackId) {
            if (host == null || !HOST_PATTERN.matcher(host).matches()) {
                deliver(callbackId, failure(host, "invalid_host"));
                return;
            }
            final int count = Math.max(1, Math.min(requestedCount, 10));
            new Thread(() -> deliver(callbackId, runPing(host, count))).start();
        }

        private void deliver(String callbackId, String payload) {
            final String script = "window.__wakzPingResult && window.__wakzPingResult("
                    + JSONObject.quote(callbackId) + "," + JSONObject.quote(payload) + ")";
            activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
        }

        private String failure(String host, String error) {
            try {
                JSONObject json = new JSONObject();
                json.put("ok", false);
                json.put("host", host == null ? "" : host);
                json.put("method", "icmp");
                json.put("attempts", new JSONArray());
                json.put("lossPercent", 100);
                json.put("error", error);
                return json.toString();
            } catch (Exception exception) {
                return "{\"ok\":false,\"error\":\"bridge_failure\"}";
            }
        }

        private String runPing(String host, int count) {
            Process process = null;
            StringBuilder output = new StringBuilder();
            try {
                ProcessBuilder builder = new ProcessBuilder(
                        "/system/bin/ping", "-c", String.valueOf(count), "-W", "2", host);
                builder.redirectErrorStream(true);
                process = builder.start();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        output.append(line).append('\n');
                        if (output.length() > 20_000) break;
                    }
                }
                process.waitFor(15, TimeUnit.SECONDS);

                String text = output.toString();
                JSONArray attempts = new JSONArray();
                int seq = 1;
                for (String line : text.split("\n")) {
                    Matcher matcher = TIME_PATTERN.matcher(line);
                    if (matcher.find()) {
                        try {
                            JSONObject attempt = new JSONObject();
                            attempt.put("seq", seq++);
                            attempt.put("ms", Math.round(Double.parseDouble(matcher.group(1))));
                            attempts.put(attempt);
                        } catch (NumberFormatException ignored) {
                            // Skip malformed lines.
                        }
                    }
                }
                for (int index = attempts.length(); index < count; index += 1) {
                    JSONObject attempt = new JSONObject();
                    attempt.put("seq", index + 1);
                    attempt.put("ms", JSONObject.NULL);
                    attempts.put(attempt);
                }

                Matcher lossMatcher = LOSS_PATTERN.matcher(text);
                int loss = attempts.length() == count ? 0 : Math.round(((count - attempts.length()) * 100f) / count);
                if (lossMatcher.find()) {
                    try {
                        loss = Math.round(Float.parseFloat(lossMatcher.group(1)));
                    } catch (NumberFormatException ignored) {
                        // Keep the computed value.
                    }
                }

                JSONObject json = new JSONObject();
                json.put("ok", attempts.length() > 0);
                json.put("host", host);
                json.put("method", "icmp");
                json.put("attempts", attempts);
                json.put("lossPercent", loss);
                json.put("error", attempts.length() > 0 ? JSONObject.NULL : "unreachable");
                return json.toString();
            } catch (Exception exception) {
                return failure(host, exception.getClass().getSimpleName());
            } finally {
                if (process != null) process.destroy();
            }
        }
    }
}
