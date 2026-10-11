from enum import StrEnum


class AppointmentType(StrEnum):
    PRESENCIAL = "presencial"
    ONLINE = "online"


class AppointmentStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class NotificationType(StrEnum):
    CONFIRMATION = "confirmation"
    REMINDER_SAME_DAY = "reminder_same_day"


class NotificationStatus(StrEnum):
    SENT = "sent"
    FAILED = "failed"
