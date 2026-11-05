package com.vincezone.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.Date

@Entity(tableName = "chat_messages")
data class ChatEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val sessionId: String,
    val role: String, // "user" or "assistant"
    val content: String,
    val model: String,
    val timestamp: Long = System.currentTimeMillis()
) {
    fun toMessage(): ChatMessage {
        return ChatMessage(
            id = id,
            sessionId = sessionId,
            role = role,
            content = content,
            model = model,
            timestamp = Date(timestamp)
        )
    }
}

data class ChatMessage(
    val id: Long,
    val sessionId: String,
    val role: String,
    val content: String,
    val model: String,
    val timestamp: Date
) {
    fun isUser() = role == "user"
}