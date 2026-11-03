package com.vincezone.app.model

data class ChatSession(
    val id: String,
    val title: String,
    val updatedAt: Long = System.currentTimeMillis()
)
