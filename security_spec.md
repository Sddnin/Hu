# Security Specification — LexiCard Firestore Rules

## 1. Data Invariants
1. **Strict User Ownership**: Every document in `/users/{userId}`, `/users/{userId}/decks/{deckId}`, `/users/{userId}/decks/{deckId}/cards/{cardId}`, and `/users/{userId}/studySessions/{sessionId}` is strictly owned by `userId` (`request.auth.uid == userId` and `data.ownerId == request.auth.uid`).
2. **Email Verification Gate**: All authenticated reads and writes require `request.auth.token.email_verified == true`.
3. **Parent Integrity (Master Gate)**:
   - A `Deck` or `StudySession` under `/users/{userId}` requires the parent `/users/{userId}` document to exist and belong to `request.auth.uid`.
   - A `Flashcard` under `/users/{userId}/decks/{deckId}/cards/{cardId}` requires the parent `/users/{userId}/decks/{deckId}` document to exist and belong to `request.auth.uid`, and `data.deckId == deckId`.
4. **Immutable Ownership & Timestamps**:
   - `ownerId`, `id`, `deckId`, and `createdAt` (or `completedAt`) are immutable after creation.
   - Server timestamps (`request.time`) are strictly enforced on `createdAt`, `updatedAt`, and `completedAt`.
5. **Strict Schema & Bounds**:
   - All document IDs match `^[a-zA-Z0-9_-]+$` with length `1..128`.
   - Every string field has an explicit `.size()` upper bound.
   - `StudySession` records are append-only (no `update` allowed once completed; only owner `create` and `delete`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-User Read/Write**: User B attempts `get` or `create` on `/users/userA/decks/deck1` -> `PERMISSION_DENIED`.
2. **OwnerId Spoofing on Create**: User A creates `/users/userA/decks/deck1` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
3. **Unverified Email Write**: User A with `email_verified: false` attempts to create a deck -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: User A creates a card with an extra field `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` check).
5. **Shadow Update Injection**: User A updates a deck with an extra ghost field `verified: true` -> `PERMISSION_DENIED` (`affectedKeys().hasOnly(...)`).
6. **ID Poisoning (Oversized ID)**: User A attempts to create a deck at `/users/userA/decks/<200-char-id>` -> `PERMISSION_DENIED` (`isValidId`).
7. **Text Exhaustion (1MB String)**: User A creates a card with `meaning` length > 240 chars -> `PERMISSION_DENIED`.
8. **Client Timestamp Forgery**: User A creates a `StudySession` with a client-forged `completedAt` in the past -> `PERMISSION_DENIED` (`completedAt == request.time`).
9. **Immutable Field Mutation**: User A updates a card trying to change `ownerId` or `deckId` or `createdAt` -> `PERMISSION_DENIED`.
10. **Orphaned Card Write**: User A writes a card into `/users/userA/decks/nonexistentDeck/cards/card1` -> `PERMISSION_DENIED` (parent `exists()` check).
11. **Terminal StudySession Mutation**: User A attempts to `update` an existing `StudySession` score from `2/10` to `10/10` -> `PERMISSION_DENIED` (`allow update: if false`).
12. **Blanket List Query Scraping**: User B runs `list` on `/users/userA/studySessions` -> `PERMISSION_DENIED` (`isOwner(userId)` & `resource.data.ownerId == request.auth.uid`).
