from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_invitation_email(
    to: str,
    workspace_name: str,
    inviter_name: str,
    accept_url: str,
) -> None:
    """Send a workspace invitation via Resend.

    Raises:
        RuntimeError: If RESEND_API_KEY is not configured.
        Exception: If the Resend API call fails (after logging).
    """
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.error("RESEND_API_KEY not configured — cannot send invitation email to %s", to)
        raise RuntimeError("Email service not configured. Please set RESEND_API_KEY.")

    import html as html_mod
    import resend

    resend.api_key = api_key
    safe_workspace = html_mod.escape(workspace_name)
    safe_inviter = html_mod.escape(inviter_name)

    body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">
        You've been invited to join <strong>{safe_workspace}</strong>
      </h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
        {safe_inviter} has invited you to collaborate on AskDocs.
      </p>
      <a href="{accept_url}"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500">
        Accept Invitation
      </a>
      <p style="margin-top:20px;font-size:12px;color:#9ca3af">
        Or copy this link: {accept_url}
      </p>
    </div>
    """

    try:
        resend.Emails.send({
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to],
            "subject": f"You've been invited to join {workspace_name} on AskDocs",
            "html": body,
        })
    except Exception:
        logger.exception("Failed to send invitation email to %s", to)
        raise
