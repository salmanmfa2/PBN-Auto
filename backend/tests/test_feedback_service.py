import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.history_db import Base
from app.models.auth import User
from app.schemas.feedback import FeedbackCreate
from app.services import feedback_service


class FeedbackServiceTests(unittest.TestCase):
    def test_feedback_requires_a_menu_and_nonblank_text(self):
        request = FeedbackCreate(menu="Overall", feedback="  Useful feedback  ")
        self.assertEqual(request.feedback, "Useful feedback")

        with self.assertRaises(ValidationError):
            FeedbackCreate(menu="Unknown menu", feedback="Comment")
        with self.assertRaises(ValidationError):
            FeedbackCreate(menu="Overall", feedback="   ")

    def test_feedback_can_be_listed_deleted_and_cleared(self):
        test_engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(test_engine)
        try:
            with Session(test_engine) as db:
                db.add(User(user="alice", name="Alice", password="test-password"))
                db.commit()

                first = feedback_service.create_feedback(
                    db,
                    "alice",
                    "Overall",
                    "First comment",
                )
                second = feedback_service.create_feedback(
                    db,
                    "alice",
                    "PBN Analytics",
                    "Second comment",
                )

                self.assertEqual(
                    [item.id for item in feedback_service.list_feedback(db)],
                    [second.id, first.id],
                )
                self.assertTrue(feedback_service.delete_feedback(db, first.id))
                self.assertFalse(feedback_service.delete_feedback(db, first.id))
                self.assertEqual(feedback_service.clear_feedback(db), 1)
                self.assertEqual(feedback_service.list_feedback(db), [])
        finally:
            Base.metadata.drop_all(test_engine)
            test_engine.dispose()


if __name__ == "__main__":
    unittest.main()
