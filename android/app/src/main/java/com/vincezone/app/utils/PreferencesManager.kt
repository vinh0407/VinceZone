package com.vincezone.app.utils

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("vincezone_prefs", Context.MODE_PRIVATE)
    private val gson = Gson()

    // Server settings
    var serverUrl: String
        get() = prefs.getString("server_url", "http://10.0.2.2:3300") ?: "http://10.0.2.2:3300"
        set(value) = prefs.edit().putString("server_url", value).apply()

    var apiKey: String
        get() = prefs.getString("api_key", "") ?: ""
        set(value) = prefs.edit().putString("api_key", value).apply()

    // Model settings
    var selectedModel: String
        get() = prefs.getString("selected_model", "kilo-auto/free") ?: "kilo-auto/free"
        set(value) = prefs.edit().putString("selected_model", value).apply()

    var temperature: Float
        get() = prefs.getFloat("temperature", 0.7f)
        set(value) = prefs.edit().putFloat("temperature", value).apply()

    var maxTokens: Int
        get() = prefs.getInt("max_tokens", 2000)
        set(value) = prefs.edit().putInt("max_tokens", value).apply()

    var systemPrompt: String
        get() = prefs.getString("system_prompt", "You are a helpful AI assistant.") ?: "You are a helpful AI assistant."
        set(value) = prefs.edit().putString("system_prompt", value).apply()

    // UI settings
    var isDarkMode: Boolean
        get() = prefs.getBoolean("dark_mode", true)
        set(value) = prefs.edit().putBoolean("dark_mode", value).apply()

    var fontSize: Float
        get() = prefs.getFloat("font_size", 14f)
        set(value) = prefs.edit().putFloat("font_size", value).apply()

    // Chat history
    fun saveChatHistory(chats: List<ChatHistoryItem>) {
        val json = Gson().toJson(chats)
        prefs.edit().putString("chat_history", json).apply()
    }

    fun getChatHistory(): List<ChatHistoryItem> {
        val json = prefs.getString("chat_history", "[]") ?: "[]"
        val type = object : TypeToken<List<ChatHistoryItem>>() {}.type
        return Gson().fromJson(json, type)
    }

    fun addChatHistoryItem(item: ChatHistoryItem) {
        val history = getChatHistory().toMutableList()
        history.add(0, item)
        if (history.size > 100) history.removeLast()
        saveChatHistory(history)
    }

    fun clearChatHistory() {
        prefs.edit().remove("chat_history").apply()
    }

    data class ChatHistoryItem(
        val id: String = java.util.UUID.randomUUID().toString(),
        val timestamp: Long = System.currentTimeMillis(),
        val userMessage: String,
        val aiResponse: String,
        val model: String
    )
}