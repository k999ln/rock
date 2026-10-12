# Sky dedicated service deployment

The dedicated Site hosts the same Sky UI and authenticated APIs. Its fresh DB is initialized from the canonical migration union using prepared statements, including all 26 guards. API requests remain unavailable until the complete schema is initialized. This adapter is dedicated to the new Sky Site and must not initialize or replace an existing OS database. The schema snapshot needs regeneration and explicit upgrade handling when the canonical schema changes; it is not a general migration engine.

Site: appgprj_6abdfad4c5648191bcae957913bd02fa. Deployed source is preserved in Sites commit 4d6d66332f7793b3e0d47ac175e100b6fea10b56. GitHub main has not been pushed in this chat.
