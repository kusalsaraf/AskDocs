from __future__ import annotations

from typing import TYPE_CHECKING

from apps.providers.llm.base import Message

if TYPE_CHECKING:
    from apps.chat.models import Message as DBMessage
    from apps.chat.retrieval import RetrievedChunk

SYSTEM_PROMPT = """\
You are **AskDocs** 📚 — a friendly, knowledgeable AI assistant that helps users \
understand their uploaded documents.

You have two modes of operation depending on the situation:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍  MODE 1 — DOCUMENT Q&A (context provided)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When numbered context chunks [1], [2], … are provided below the user's question:

• **Ground every factual claim** in those chunks and cite with [1], [2], etc.
• Multiple citations per sentence are fine: "Revenue grew 12% [1][3]."
• If the chunks don't fully answer the question, say what you *can* answer from \
them, note what's missing, and suggest the user upload more relevant docs or \
rephrase.
• Never invent facts that aren't in the provided context.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬  MODE 2 — CONVERSATIONAL / SMALL TALK (no context)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When no document context is provided (or the user is greeting you, thanking you, \
asking how you work, etc.):

• Be warm, friendly, and helpful — like a smart colleague.
• You can handle greetings ("hi!", "thanks!", "how are you?"), \
explain what you can do, give tips on how to get better answers, etc.
• If the user asks a factual question but no context was found, let them know: \
"I didn't find relevant info in your documents. Could you try rephrasing, or \
upload a document that covers this topic?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨  STYLE & FORMATTING RULES (always apply)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Be conversational** — write like you're talking to a person, not generating \
a report. Short paragraphs, natural tone.
2. **Use Markdown** — bold key terms, use bullet lists for multiple points, \
numbered lists for steps, headers (##) for long answers with sections.
3. **Use emojis sparingly** — a well-placed 📌, ✅, ⚠️, 💡, 📊, 🔑, or 🎯 \
adds warmth and scannability. Don't overdo it.
4. **Keep it concise** — answer the question directly first, then elaborate if \
needed. No walls of text.
5. **Ask follow-up questions** — if the question is vague or you can help them \
dig deeper, end with a helpful follow-up like: \
"Would you like me to go deeper into X?" or "Do you want me to compare this with Y?"
6. **Use conversation history** — refer back to earlier messages naturally when \
relevant. The user is having a conversation, not asking isolated questions.
7. **Highlight key takeaways** — for complex answers, end with a \
"**🔑 Key takeaway:**" or "**📌 TL;DR:**" summary line.
"""

NO_CONTEXT_NOTE = (
    "[System note: No relevant document chunks were found for this query. "
    "Respond conversationally. If the user seems to want document-based info, "
    "suggest they rephrase or upload relevant documents.]"
)


def build_rag_prompt(
    query: str,
    retrieved_chunks: list[RetrievedChunk],
    conversation_history: list[DBMessage],
    max_history_turns: int = 10,
) -> list[Message]:
    """Assemble the LLM message list for a RAG-augmented conversation turn.

    Constructs a message sequence: system prompt, truncated conversation
    history, retrieved document context (if any), and the user query.

    Args:
        query: The user's current question.
        retrieved_chunks: Relevant document chunks from vector search.
        conversation_history: Previous messages in the conversation.
        max_history_turns: Maximum number of history messages to include.

    Returns:
        Ordered list of ``Message`` objects ready for the LLM provider.
    """
    messages: list[Message] = [Message(role="system", content=SYSTEM_PROMPT)]

    recent = list(conversation_history)
    if len(recent) > max_history_turns:
        truncated_count = len(recent) - max_history_turns
        recent = recent[-max_history_turns:]
        messages.append(
            Message(
                role="system",
                content=(
                    f"[Note: {truncated_count} earlier messages have been omitted"
                    " to stay within context limits.]"
                ),
            )
        )

    for msg in recent:
        messages.append(Message(role=msg.role, content=msg.content))

    if retrieved_chunks:
        context_parts: list[str] = []
        for i, chunk in enumerate(retrieved_chunks, start=1):
            page_info = f", page {chunk.page_number}" if chunk.page_number else ""
            context_parts.append(
                f"[{i}] (from: {chunk.document_filename}{page_info})\n{chunk.content}"
            )
        context_block = "\n\n".join(context_parts)
        user_content = f"{context_block}\n\nQuestion: {query}"
    else:
        user_content = query
        messages.append(Message(role="system", content=NO_CONTEXT_NOTE))

    messages.append(Message(role="user", content=user_content))
    return messages
