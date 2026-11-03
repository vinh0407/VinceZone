package com.vincezone.app

import android.content.Context
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val prefs = getSharedPreferences("vincezone_prefs", Context.MODE_PRIVATE)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val etServerUrl = findViewById<EditText>(R.id.etServerUrl)
        val etApiKey = findViewById<EditText>(R.id.etApiKey)
        val btnSaveSettings = findViewById<Button>(R.id.btnSaveSettings)

        // Load saved values
        val savedUrl = prefs.getString("server_url", "http://10.0.2.2:3000")
        val savedKey = prefs.getString("custom_api_key", "")
        etServerUrl.setText(savedUrl)
        etApiKey.setText(savedKey)

        btnBack.setOnClickListener {
            finish()
        }

        btnSaveSettings.setOnClickListener {
            val url = etServerUrl.text.toString().trim()
            val key = etApiKey.text.toString().trim()

            if (url.isBlank()) {
                Toast.makeText(this, "Vui lòng nhập địa chỉ máy chủ hợp lệ", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            prefs.edit()
                .putString("server_url", url)
                .putString("custom_api_key", key)
                .apply()

            Toast.makeText(this, "Đã lưu cài đặt kết nối thành công!", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}
