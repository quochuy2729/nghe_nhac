package io.github.quochuy2729.nghenhac;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import io.github.quochuy2729.nghenhac.plugins.MusicLibraryPlugin;
import io.github.quochuy2729.nghenhac.plugins.NativePlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin tự viết phải đăng ký trước super.onCreate.
        registerPlugin(MusicLibraryPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        // Android 13+: cần quyền thông báo để hiện notification điều khiển nhạc.
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }
}
