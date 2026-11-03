package com.vincezone.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.drawerlayout.widget.DrawerLayout
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vincezone.app.adapter.ChatAdapter
import com.vincezone.app.adapter.HistoryAdapter
import com.vincezone.app.model.ChatMessage
import com.vincezone.app.model.ChatSession
import com.vincezone.app.network.VinceZoneClient
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var drawerLayout: DrawerLayout
    private lateinit var rvChat: RecyclerView
    private lateinit var rvDrawerHistory: RecyclerView
    private lateinit var welcomeHeroView: View
    private lateinit var etMessage: EditText
    private lateinit var btnSend: ImageButton
    private lateinit var progressBar: ProgressBar
    private lateinit var tvModelName: TextView

    private lateinit var chatAdapter: ChatAdapter
    private lateinit var historyAdapter: HistoryAdapter
    private val historyList = mutableListOf<ChatSession>()

    private var currentModel = "kilo-auto/free"
    private var currentSessionId: String = UUID.randomUUID().toString()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupRecyclerViews()
        setupEvents()
    }

    private fun initViews() {
        drawerLayout = findViewById(R.id.drawerLayout)
        rvChat = findViewById(R.id.rvChat)
        rvDrawerHistory = findViewById(R.id.rvDrawerHistory)
        welcomeHeroView = findViewById(R.id.welcomeHeroView)
        etMessage = findViewById(R.id.etMessage)
        btnSend = findViewById(R.id.btnSend)
        progressBar = findViewById(R.id.progressBar)
        tvModelName = findViewById(R.id.tvModelName)

        tvModelName.text = currentModel
    }

    private fun setupRecyclerViews() {
        chatAdapter = ChatAdapter()
        rvChat.layoutManager = LinearLayoutManager(this).apply {
            stackFromEnd = true
        }
        rvChat.adapter = chatAdapter

        historyAdapter = HistoryAdapter(historyList) { session ->
            drawerLayout.closeDrawer(GravityCompat.START)
            Toast.makeText(this, "Đã chọn: ${session.title}", Toast.LENGTH_SHORT).show()
        }
        rvDrawerHistory.layoutManager = LinearLayoutManager(this)
        rvDrawerHistory.adapter = historyAdapter
    }

    private fun setupEvents() {
        findViewById<ImageButton>(R.id.btnMenu).setOnClickListener {
            drawerLayout.openDrawer(GravityCompat.START)
        }

        findViewById<ImageButton>(R.id.btnNewChat).setOnClickListener {
            startNewChat()
        }

        findViewById<View>(R.id.drawerNewChat).setOnClickListener {
            drawerLayout.closeDrawer(GravityCompat.START)
            startNewChat()
        }

        findViewById<ImageButton>(R.id.btnSettings).setOnClickListener {
            openSettings()
        }

        findViewById<View>(R.id.drawerSettings).setOnClickListener {
            drawerLayout.closeDrawer(GravityCompat.START)
            openSettings()
        }

        btnSend.setOnClickListener {
            val text = etMessage.text.toString().trim()
            if (text.isNotBlank()) {
                sendMessage(text)
            }
        }

        // Quick Suggestion Chips
        findViewById<View>(R.id.cardPrompt1).setOnClickListener {
            val prompt = getString(R.string.sample_prompt_1)
            sendMessage(prompt)
        }

        findViewById<View>(R.id.cardPrompt2).setOnClickListener {
            val prompt = getString(R.string.sample_prompt_2)
            sendMessage(prompt)
        }

        findViewById<View>(R.id.cardPrompt3).setOnClickListener {
            val prompt = getString(R.string.sample_prompt_3)
            sendMessage(prompt)
        }
    }

    private fun openSettings() {
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    private fun startNewChat() {
        chatAdapter.clearMessages()
        welcomeHeroView.visibility = View.VISIBLE
        rvChat.visibility = View.GONE
        currentSessionId = UUID.randomUUID().toString()
    }

    private fun sendMessage(content: String) {
        val prefs = getSharedPreferences("vincezone_prefs", Context.MODE_PRIVATE)
        val serverUrl = prefs.getString("server_url", "http://10.0.2.2:3000") ?: "http://10.0.2.2:3000"
        val customApiKey = prefs.getString("custom_api_key", "") ?: ""

        val userMessage = ChatMessage(role = "user", content = content)
        chatAdapter.addMessage(userMessage)

        if (chatAdapter.itemCount == 1) {
            val title = if (content.length > 30) content.take(30) + "..." else content
            historyList.add(0, ChatSession(id = currentSessionId, title = title))
            historyAdapter.setSessions(historyList)
        }

        welcomeHeroView.visibility = View.GONE
        rvChat.visibility = View.VISIBLE
        etMessage.text.clear()
        rvChat.smoothScrollToPosition(chatAdapter.itemCount - 1)

        setLoading(true)

        val client = VinceZoneClient(baseUrl = serverUrl, apiKey = customApiKey)

        lifecycleScope.launch {
            val result = client.sendMessage(
                model = currentModel,
                messages = chatAdapter.getMessages()
            )

            setLoading(false)

            result.onSuccess { reply ->
                val assistantMessage = ChatMessage(role = "assistant", content = reply)
                chatAdapter.addMessage(assistantMessage)
                rvChat.smoothScrollToPosition(chatAdapter.itemCount - 1)
            }.onFailure { err ->
                val errorMessage = ChatMessage(
                    role = "assistant",
                    content = "⚠️ Lỗi kết nối: ${err.message}\n\nHãy kiểm tra lại địa chỉ Gateway trong Cài Đặt (mặc định cho máy ảo: http://10.0.2.2:3000, cho điện thoại thật: http://IP_MAY_TINH:3000)."
                )
                chatAdapter.addMessage(errorMessage)
                rvChat.smoothScrollToPosition(chatAdapter.itemCount - 1)
            }
        }
    }

    private fun setLoading(isLoading: Boolean) {
        progressBar.visibility = if (isLoading) View.VISIBLE else View.GONE
        btnSend.isEnabled = !isLoading
        btnSend.alpha = if (isLoading) 0.5f else 1.0f
    }
}
