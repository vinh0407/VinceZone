package com.vincezone.app.adapter

import android.text.Html
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.vincezone.app.R
import com.vincezone.app.data.ChatEntity
import com.vincezone.app.data.ChatMessage
import android.text.format.DateFormat

class ChatAdapter : ListAdapter<ChatMessage, ChatAdapter.MessageViewHolder>(MessageDiffCallback()) {

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_message, parent, false)
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        val message = getItem(position)
        holder.bind(message)
    }

    fun addMessage(message: ChatMessage) {
        val currentList = currentList.toMutableList()
        currentList.add(message)
        submitList(currentList)
    }

    fun updateLastMessage(chunk: String) {
        val currentList = currentList.toMutableList()
        if (currentList.isNotEmpty()) {
            val lastIndex = currentList.lastIndex
            val lastMessage = currentList[lastIndex]
            if (lastMessage.role == "assistant") {
                val updatedMessage = lastMessage.copy(content = lastMessage.content + chunk)
                currentList[lastIndex] = updatedMessage
                submitList(currentList)
            }
        }
    }

    fun removeLastIfTyping() {
        val currentList = currentList.toMutableList()
        if (currentList.isNotEmpty()) {
            val lastMessage = currentList.last()
            if (lastMessage.content == "..." && lastMessage.role == "assistant") {
                currentList.removeAt(currentList.lastIndex)
                submitList(currentList)
            }
        }
    }

    fun clearMessages() {
        submitList(emptyList())
    }

    class MessageViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val tvRole: TextView = view.findViewById(R.id.tvRole)
        private val tvContent: TextView = view.findViewById(R.id.tvContent)
        private val tvTime: TextView = view.findViewById(R.id.tvTime)
        private val container: View = view.findViewById(R.id.messageContainer)

        fun bind(message: ChatMessage) {
            val isUser = message.isUser()
            container.setBackgroundResource(
                if (isUser) R.drawable.bg_message_user else R.drawable.bg_message_assistant
            )

            tvRole.text = if (isUser) "You" else "VinceZone AI"
            tvRole.setTextColor(
                if (isUser) 0xFF10B981.toInt() else 0xFF8B5CF6.toInt()
            )

            // Render markdown-like content
            tvContent.text = Html.fromHtml(
                formatMessage(message.content),
                Html.FROM_HTML_MODE_LEGACY
            )
            tvContent.movementMethod = LinkMovementMethod.getInstance()

            // Format time
            tvTime.text = android.text.format.DateFormat.format("HH:mm", message.timestamp)
        }

        private fun formatMessage(content: String): String {
            var html = content
                .replace("&", "&")
                .replace("<", "<")
                .replace(">", ">")
                .replace("\n", "<br>")

            // Bold
            html = html.replace(Regex("\\*\\*(.+?)\\*\\*"), "<b>$1</b>")
            // Italic
            html = html.replace(Regex("\\*(.+?)\\*"), "<i>$1</i>")
            // Inline code
            html = html.replace(Regex("`(.+?)`"), "<code style='background:#27272a;padding:2px 4px;border-radius:4px;font-family:monospace;'>$1</code>")
            // Code blocks
            html = html.replace(Regex("```(\\w+)?\\n([\\s\\S]*?)```"), "<pre style='background:#1e1e1e;padding:12px;border-radius:8px;overflow-x:auto;'><code>$2</code></pre>")

            return html
        }
    }

    class MessageDiffCallback : DiffUtil.ItemCallback<ChatMessage>() {
        override fun areItemsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem.id == newItem.id
        }

        override fun areContentsTheSame(oldItem: ChatMessage, newItem: ChatMessage): Boolean {
            return oldItem == newItem
        }
    }
}