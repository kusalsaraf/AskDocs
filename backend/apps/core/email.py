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
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key:
        logger.warning("RESEND_API_KEY not set — skipping invitation email to %s", to)
        return

    import resend  # local import so missing package only fails at call time

    resend.api_key = api_key

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;font-weight:600;margin-bottom:8px">
        You've been invited to join <strong>{workspace_name}</strong>
      </h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px">
        {inviter_name} has invited you to collaborate on AskDocs.
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

    resend.Emails.send({
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to],
        "subject": f"You've been invited to join {workspace_name} on AskDocs",
        "html": html,
    })
