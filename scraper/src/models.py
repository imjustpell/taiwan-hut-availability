from dataclasses import dataclass, asdict
from typing import Literal

ParkId = Literal["taroko", "sheipa", "yushan"]
HutKind = Literal["hut", "camp", "both"]
BookingMode = Literal["first_come", "lottery"]
AvailabilityStatus = Literal["available", "full", "not_open", "closed", "lottery", "unknown"]


@dataclass
class Capacity:
    weekday_beds: int
    weekday_tents: int
    holiday_beds: int
    holiday_tents: int

    def total_capacity(self) -> int:
        return self.weekday_beds + self.weekday_tents + self.holiday_beds + self.holiday_tents

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Hut:
    id: str
    park: ParkId
    node_id: str
    name: str
    kind: HutKind
    capacity: Capacity
    booking_mode: BookingMode
    source_url: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "park": self.park,
            "node_id": self.node_id,
            "name": self.name,
            "kind": self.kind,
            "capacity": self.capacity.to_dict(),
            "booking_mode": self.booking_mode,
            "source_url": self.source_url,
        }


@dataclass
class Availability:
    hut_id: str
    date: str
    remaining_beds: int
    remaining_tents: int
    queue: int
    reviewing: int
    approved: int
    status: AvailabilityStatus

    def to_dict(self) -> dict:
        return asdict(self)
