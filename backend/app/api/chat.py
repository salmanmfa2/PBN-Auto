from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user
from app.models.auth import User
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import ChatServiceError, create_completion


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _: User = Depends(get_current_user),
) -> ChatResponse:
    try:
        answer = await create_completion(request.messages)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return ChatResponse(message=answer)
