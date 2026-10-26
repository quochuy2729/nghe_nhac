package io.github.quochuy2729.nghenhac;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.github.quochuy2729.nghenhac.plugins.MusicLibraryPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin tự viết phải đăng ký trước super.onCreate.
        registerPlugin(MusicLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
