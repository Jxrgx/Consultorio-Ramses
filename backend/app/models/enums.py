from enum import StrEnum


class AppointmentType(StrEnum):
    PRESENCIAL = "presencial"
    ONLINE = "online"


class AppointmentStatus(StrEnum):
    # Horario apartado mientras el paciente verifica su teléfono con el OTP
    HOLD = "hold"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class NotificationType(StrEnum):
    CONFIRMATION = "confirmation"
    REMINDER_SAME_DAY = "reminder_same_day"
    CANCELLATION_NOTICE = "cancellation_notice"


class NotificationStatus(StrEnum):
    SENT = "sent"
    FAILED = "failed"
