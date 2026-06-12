from typing import List, Optional

from pydantic import BaseModel, Field


class SignupIn(BaseModel):
    email: str
    username: str
    password: str = Field(min_length=8, max_length=128)
    accepted_terms: bool = False


class LoginIn(BaseModel):
    email: str
    password: str


class VerificationIn(BaseModel):
    country: str
    id_type: str
    id_image_base64: str
    selfie_base64: str


class RequestIn(BaseModel):
    to_username: str


class RequestRespondIn(BaseModel):
    action: str  # accept | reject


class MessageIn(BaseModel):
    to_user_id: str
    type: str  # text | image | video | audio | location | document
    text: Optional[str] = None
    image_base64: Optional[str] = None
    video_base64: Optional[str] = None
    audio_base64: Optional[str] = None
    document_base64: Optional[str] = None
    document_name: Optional[str] = None
    document_mime: Optional[str] = None
    document_size: Optional[int] = None
    duration_ms: Optional[int] = None  # for audio/video
    waveform: Optional[List[int]] = None  # for voice notes
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_label: Optional[str] = None
    view_once: bool = False
    reply_to_id: Optional[str] = None


class LocationIn(BaseModel):
    event: str = "login"
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None


class ReportIn(BaseModel):
    target_user_id: str
    reason: str = Field(min_length=3, max_length=500)
    category: str = "abuse"


class BlockIn(BaseModel):
    target_user_id: str


class ScreenshotEventIn(BaseModel):
    chat_with: Optional[str] = None
    message_id: Optional[str] = None
    context: str = "chat"


class DeleteForEveryoneIn(BaseModel):
    message_id: str


class ImageViewedIn(BaseModel):
    message_id: str


class ReactionIn(BaseModel):
    message_id: str
    emoji: str = Field(min_length=1, max_length=8)


class TypingIn(BaseModel):
    to_user_id: str


class GroupCreateIn(BaseModel):
    type: str = "group"  # "group" | "community"
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    avatar_base64: Optional[str] = None
    is_public: bool = False


class GroupEditIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    avatar_base64: Optional[str] = None
    who_can_send: Optional[str] = None  # "all" | "admins"
    who_can_add: Optional[str] = None   # "all" | "admins"


class GroupMessageIn(BaseModel):
    type: str  # text | image | video | audio | location | document
    text: Optional[str] = None
    image_base64: Optional[str] = None
    video_base64: Optional[str] = None
    audio_base64: Optional[str] = None
    document_base64: Optional[str] = None
    document_name: Optional[str] = None
    document_mime: Optional[str] = None
    document_size: Optional[int] = None
    duration_ms: Optional[int] = None
    waveform: Optional[List[int]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_label: Optional[str] = None
    reply_to_id: Optional[str] = None


class GroupMemberAddIn(BaseModel):
    user_id: str


class GroupRoleIn(BaseModel):
    role: str  # "admin" | "member"


class GroupJoinIn(BaseModel):
    join_code: Optional[str] = None
    typing: bool = True


class ProfileImageIn(BaseModel):
    image_base64: str


class StatusIn(BaseModel):
    type: str  # text | image | video
    text: Optional[str] = None
    background: Optional[str] = None  # hex color for text status
    image_base64: Optional[str] = None
    video_base64: Optional[str] = None
    caption: Optional[str] = None
    duration_ms: Optional[int] = None  # for video


class AdminRoleIn(BaseModel):
    user_id: str
    role: str


class AdminRevealIn(BaseModel):
    reason: str = Field(min_length=4, max_length=200)


class AdminResolveReportIn(BaseModel):
    action: str = "dismiss"
    notes: Optional[str] = None
