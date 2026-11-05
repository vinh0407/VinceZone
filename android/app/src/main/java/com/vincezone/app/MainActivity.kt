package com.vincezone.app

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.vincezone.app.adapter.ChatAdapter
import com.vincezone.app.data.ChatEntity
import com.vincezone.app.databinding.ActivityMainBinding
import com.vincezone.app.network.VinceZoneClient
import com.vincezone.app.utils.PreferencesManager
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var chatAdapter: ChatAdapter
    private lateinit var vinceZoneClient: VinceZoneClient
    private lateinit var prefs: PreferencesManager
    private var currentSessionId = "default_session"
    private var isStreaming = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = VinceZoneApplication.getInstance().preferencesManager
        vinceZoneClient = VinceZoneApplication.getInstance().vinceZoneClient

        setupUI()
        loadChatHistory()
        setupListeners()
    }

    private fun setupUI() {
        // RecyclerView setup
        chatAdapter = ChatAdapter()
        binding.recyclerView.layoutManager = LinearLayoutManager(this)
        binding.recyclerView.adapter = chatAdapter

        // Set default model
        binding.modelText.text = prefs.selectedModel
    }

    private fun setupListeners() {
        binding.btnSend.setOnClickListener { sendMessage() }
        binding.chatInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                sendMessage()
                true
            } else false
        }

        binding.btnMenu.setOnClickListener { showSidebar() }
        binding.btnNewChat.setOnClickListener { startNewChat() }
        binding.btnSettings.setOnClickListener { openSettings() }
        binding.btnAttach.setOnClickListener { showAttachMenu() }
    }

    private fun loadChatHistory() {
        lifecycleScope.launch {
            val dao = VinceZoneApplication.getInstance().chatDao
            val messages = dao.getMessagesForSessionSync(currentSessionId)
            chatAdapter.submitList(messages.map { it.toMessage() })
            binding.recyclerView.scrollToPosition(chatAdapter.itemCount - 1)
        }
    }

    private fun sendMessage() {
        val text = binding.chatInput.text.toString().trim()
        if (text.isBlank() || isStreaming) return

        // Add user message
        val userMessage = ChatEntity(
            sessionId = currentSessionId,
            role = "user",
            content = text,
            model = prefs.selectedModel
        )
        chatAdapter.addMessage(userMessage.toMessage())
        binding.chatInput.text.clear()
        binding.recyclerView.scrollToPosition(chatAdapter.itemCount - 1)

        // Save user message
        lifecycleScope.launch {
            VinceZoneApplication.getInstance().chatDao.insert(userMessage)
        }

        // Show typing indicator
        addTypingIndicator()

        isStreaming = true
        binding.btnSend.isEnabled = false

        // Send to API
        lifecycleScope.launch {
            val messages = chatAdapter.currentList.map { it.toChatMessage() }
            vinceZoneClient.sendMessage(
                messages = messages,
                temperature = prefs.temperature,
                maxTokens = prefs.maxTokens,
                systemPrompt = prefs.systemPrompt,
                onStream = { chunk ->
                    runOnUiThread { updateStreamingMessage(chunk) }
                }
            ).onSuccess { fullResponse ->
                runOnUiThread {
                    removeTypingIndicator()
                    addAssistantMessage(fullResponse)
                    isStreaming = false
                    binding.btnSend.isEnabled = true
                }
            }.onFailure { e ->
                runOnUiThread {
                    removeTypingIndicator()
                    showError("Error: ${e.message}")
                    isStreaming = false
                    binding.btnSend.isEnabled = true
                }
            }
        }
    }

    private fun addAssistantMessage(content: String) {
        val message = ChatEntity(
            sessionId = currentSessionId,
            role = "assistant",
            content = content,
            model = prefs.selectedModel
        )
        chatAdapter.addMessage(message.toMessage())
        binding.recyclerView.scrollToPosition(chatAdapter.itemCount - 1)

        // Save to database
        lifecycleScope.launch {
            VinceZoneApplication.getInstance().chatDao.insert(
                ChatEntity(
                    sessionId = currentSessionId,
                    role = "assistant",
                    content = content,
                    model = prefs.selectedModel
                )
            )
        }
    }

    private var streamingMessageId: Long = -1

    private fun addTypingIndicator() {
        val typingMessage = ChatEntity(
            id = -1,
            sessionId = currentSessionId,
            role = "assistant",
            content = "...",
            model = prefs.selectedModel
        )
        chatAdapter.addMessage(typingMessage.toMessage())
        streamingMessageId = -1
        binding.recyclerView.scrollToPosition(chatAdapter.itemCount - 1)
    }

    private fun removeTypingIndicator() {
        chatAdapter.removeLastIfTyping()
    }

    private fun updateStreamingMessage(chunk: String) {
        chatAdapter.updateLastMessage(chunk)
        binding.recyclerView.scrollToPosition(chatAdapter.itemCount - 1)
    }

    private fun showError(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun showSidebar() {
        Toast.makeText(this, "Sidebar - Coming soon", Toast.LENGTH_SHORT).show()
    }

    private fun startNewChat() {
        currentSessionId = "session_${System.currentTimeMillis()}"
        chatAdapter.clearMessages()
        binding.recyclerView.scrollToPosition(0)
        Toast.makeText(this, "New chat started", Toast.LENGTH_SHORT).show()
    }

    private fun openSettings() {
        Toast.makeText(this, "Settings - Coming soon", Toast.LENGTH_SHORT).show()
    }

    private fun showAttachMenu() {
        Toast.makeText(this, "Attach - Coming soon", Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        super.onDestroy()
    }
}