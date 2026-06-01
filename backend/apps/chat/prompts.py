from __future__ import annotations

from typing import TYPE_CHECKING

from apps.providers.llm.base import Message

if TYPE_CHECKING:
    from apps.chat.models import Message as DBMessage
    from apps.chat.retrieval import RetrievedChunk

SYSTEM_PROMPT = (
    "You are AskDocs, an AI assistant that answers questions strictly based on the provided"
    " document context.\n\n"
    "Rules:\n"
    "- Answer only from the context below. If the context doesn't contain the answer, say so"
    " clearly — never make up information.\n"
    "- Cite sources inline using bracketed numbers like [1], [2], [3], matching the numbered"
    " context chunks.\n"
    "- Every claim grounded in the context must have a citation. Multiple citations are fine.\n"
    "- Keep answers concise and well-structured. Use Markdown for formatting (bold, lists,"
    " headings when useful).\n"
    "- If asked something outside the provided documents, politely refuse and suggest rephrasing.\n"
    "\n"
    "Context follows. Each chunk is numbered [N] and includes its source."
)


def build_rag_prompt(
    query: str,
    retrieved_chunks: list[RetrievedChunk],
    conversation_history: list[DBMessage],
    max_history_turns: int = 6,
) -> list[Message]:
    messages: list[Message] = [Message(role="system", content=SYSTEM_PROMPT)]

    # Bounded conversation history (last N turns = N/2 user + N/2 assistant pairs)
    recent = list(conversation_history)
    if len(recent) > max_history_turns:
        truncated_count = len(recent) - max_history_turns
        recent = recent[-max_history_turns:]
        # Prepend a system note about truncation
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

    # Build the user message with numbered context chunks
    context_parts: list[str] = []
    for i, chunk in enumerate(retrieved_chunks, start=1):
        page_info = f", page {chunk.page_number}" if chunk.page_number else ""
        context_parts.append(
            f"[{i}] (from: {chunk.document_filename}{page_info})\n{chunk.content}"
        )

    context_block = "\n\n".join(context_parts)
    user_content = (
        f"{context_block}\n\nQuestion: {query}" if context_block else f"Question: {query}"
    )

    messages.append(Message(role="user", content=user_content))
    return messages
