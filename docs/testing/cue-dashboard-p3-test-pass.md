CUE dashboard P3 test pass

This build adds shared money: lend and borrow from Quick Add with dates and due dates, part payments with a person, and groups for splitting trips, flats and dinners.

Install (Android only): open the APK link on your phone, tap Download, open the file, and allow "Install from this source" if Android asks. Install it over your current CUE: your account and data stay.

Report each problem as: step number, what you did, what you saw, a screenshot or screen recording if possible.
Amounts can be made up. CUE only records what you type; no real money moves.

How shared money works, so you're not surprised:
- Group members are names you type. They don't need CUE, and they don't see anything.
- When you pay for a group, only your share counts as your spending. What others owe you is counted in your net worth as money owed to you.
- When someone else pays, your share counts as spending and you owe it. None of your accounts change.
- Paying back or being paid back is never income or spending.
- Personal Khata and groups are kept apart, so nothing is counted twice.

Already known, no need to report:
- Groups can only split equally or by exact amounts (no percentages).
- Everything listed as known in the 1.2.2 guide still applies.

Test the steps below one by one and write your result next to each (WORKS / DOESN'T / what happened).

Quick Add
1. Tap +. The grid shows Expense, Income, Transfer, Lend, Borrow, Subscription or bill, Goal Jar, Group Expense and Settlement.
2. Lend: enter a person, ₹2,000, Cash, and Yesterday. Under More options add a due date and a note. Save. Cash goes down by ₹2,000, net worth stays the same, and the person shows in Khata.
3. Borrow ₹1,000 from someone into your bank. The bank goes up, net worth stays the same.

Part payments
4. In Khata › Personal, tap the person you lent ₹2,000. It says "Owes you ₹2,000" and shows the due date.
5. Tap Record a payment. "They paid me", ₹500, Cash. Save. They now owe ₹1,500, the entry says "₹1,500 still open after part payments", and Cash goes up by ₹500.
6. Record ₹2,000 more from them. CUE warns "More than is owed" and says the extra ₹500 will be recorded the other way. Tap Record it: now you owe them ₹500.
7. "Mark fully received" on an entry settles whatever is still open on it, not the original amount.

Groups
8. Khata has Personal and Groups tabs. In Groups tap + New group: a name, an icon, and two people (Megha, Aditi). Create it. The group screen opens.
9. Add expense: Dinner ₹3,000, You paid from your bank, split equally between all three. Each chip shows ₹1,000.
10. The group says "You're owed ₹2,000"; Balances show Megha owes ₹1,000 and Aditi owes ₹1,000; To settle up shows "Megha pays you ₹1,000" and "Aditi pays you ₹1,000".
11. On Today: the bank went down ₹3,000, net worth went down only ₹1,000 (your share), and the Expenses tile went up by ₹1,000.
12. Today's list shows one row "Dinner · [group] · Your share ₹1,000" with "− ₹3,000 paid". Tapping it opens the expense in the group.
13. Add another expense: Megha paid ₹1,500, split by amounts: You ₹500, Megha ₹1,000. Try amounts that don't add up first: it says how much is still to split.
14. After that expense, none of your accounts changed, your spending went up ₹500, and the group balance went down by ₹500.
15. Tap "Megha pays you ₹1,000" under To settle up. The Settlement sheet opens filled in. Choose Cash and save. Cash goes up, and the group balance updates.
16. Edit an expense (tap it): change the amount. Everyone's balance updates. Delete it, then tap Undo: it comes back.
17. Tap a settlement in the group to delete it.
18. Edit group: add a person, remove someone with no expenses. Someone with expenses can't be removed.
19. Archive a group that isn't settled: CUE asks you to settle up first.

Elsewhere
20. Net worth › View breakdown: Money lent and Owed to you in groups are separate rows; so are Money borrowed and You owe in groups. Tapping a group row opens Khata › Groups.
21. Without any groups, the group rows don't show in the breakdown.
22. Transactions › Group expenses filter shows only group rows; the Khata filter shows only personal lending and borrowing.
23. Tap the eye icon: group amounts show ₹ •••••.
24. Airplane mode, then reopen Khata › Groups: it says "Could not load" without breaking the rest of the app.
