package com.vincezone.app.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.vincezone.app.R
import com.vincezone.app.model.ChatSession
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class HistoryAdapter(
    private val sessions: MutableList<ChatSession> = mutableListOf(),
    private val onSessionClick: (ChatSession) -> Unit
) : RecyclerView.Adapter<HistoryAdapter.HistoryViewHolder>() {

    private val dateFormat = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): HistoryViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_history, parent, false)
        return HistoryViewHolder(view)
    }

    override fun onBindViewHolder(holder: HistoryViewHolder, position: Int) {
        val session = sessions[position]
        holder.tvTitle.text = session.title
        holder.tvDate.text = dateFormat.format(Date(session.updatedAt))
        holder.itemView.setOnClickListener { onSessionClick(session) }
    }

    override fun getItemCount(): Int = sessions.size

    fun setSessions(list: List<ChatSession>) {
        sessions.clear()
        sessions.addAll(list)
        notifyDataSetChanged()
    }

    class HistoryViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvTitle: TextView = itemView.findViewById(R.id.tvHistoryTitle)
        val tvDate: TextView = itemView.findViewById(R.id.tvHistoryDate)
    }
}
