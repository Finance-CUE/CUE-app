CUE dashboard P0 test pass

This build changes the Today tab: your accounts, net worth, a new way to log entries, and a full transaction history.

Install (Android only): open the APK link we send you on your phone, tap Download, open the file, and allow "Install from this source" when Android asks. Install it over the old CUE: your account and data stay.

Report each problem as: step number, what you did, what you saw, screenshot if possible.
You can use made-up amounts. Nothing here moves real money; CUE only records what you type in.

What is different from 1.1.0, so you're not surprised:
- Money you lent counts as yours and money you borrowed as owed, so both are now part of your net worth.
- Lending or borrowing moves money out of or into an account straight away (Cash unless you pick another).
- A spend you add for a day before your last balance update no longer comes off your balance a second time.
- Paying someone back is no longer listed as a spend.

Already known, no need to report:
- Nudge notifications start with "[PLACEHOLDER]".
- The "this month" change under your net worth stays hidden until you have used CUE for a full previous month.
- Banks show a letter, not their logo, for now.
- The week chart counts spending only. A new chart replaces it in the next update.
- Days after today can't be picked on the date strip yet.
- There is no iPhone version yet.
- The very first open after a long quiet period can take up to a minute. You should see "Waking CUE up" while it loads.

Test the steps below one by one and write your result next to each (WORKS / DOESN'T / what happened).

First open
1. If you were already using CUE: open the app. Today shows your net worth, and under "Your accounts" a Bank and a Cash account with the balances you had before. Check the amounts look right.
2. New account only: after the assessment, CUE asks "Where does your money stand?". Search for your bank (try typing "hd" or "sbi"), enter a bank balance and some cash, leave Balance on as Today and tap Continue. You land on Today with two accounts.

The top of Today
3. The top says "Good morning / afternoon / evening," and "Hello, [your first name]." Tap your initials: the You tab opens.
4. Under the greeting is a row of seven days. Today has a small dot and is highlighted. Days with entries have a second dot.
5. Tap a past day: it highlights, and a chip says "Viewing [day] · Back to today". Tap the chip: you're back on today.
6. Swipe the row of days to the right: last week shows. Swipe left, or tap the arrows, to come back.
7. Tap Calendar: a month opens with dots on days that have entries. Pick a past date: the sheet closes and that day is selected.
8. Scroll down: the top shrinks to a thin bar with your name and the selected day.

Net worth
9. The card shows YOUR NET WORTH, a large amount, and under a line "Available balance" and "Liabilities". Check that available balance is your bank plus cash.
10. Tap the eye icon: every amount in the app changes to ₹ •••••. Close and reopen the app: amounts are still hidden. Tap the eye again to show them.
11. Tap View breakdown: Assets and Liabilities tables open, with "Net worth = Total assets − Total liabilities". Check the totals add up. Tap Money lent: Khata opens.
12. Back on Today, tap Accounts on the card: the screen scrolls to Your accounts.

Accounts
13. Tap + Add account. Choose Credit card, search a bank, enter an amount due of 5,000 and Balance on Today. It appears under "Cards and loans" as "₹5,000 due", and your net worth goes down by 5,000.
14. Add a savings account with Balance on set to Another day a week ago. Then log an expense on it dated before that day: its balance does not change.
15. Tap an account: its screen shows the balance, money received and spent this month, recent transactions, month by month and account details.
16. On the account screen tap Edit account, change the nickname and save. The new name shows everywhere.
17. Tap Archive account on an account that has money in it: CUE refuses and says to move the balance first. Move it out with a Transfer, then archive: it leaves the list.

Update balance
18. On the net worth card tap Update balance. Pick an account and type a slightly lower amount than CUE shows. CUE says "CUE shows ₹…, you entered ₹…, difference −₹…". Pick Bank charge and save: the balance now matches what you typed.
19. Do it again, pick Missed transaction: CUE offers "Add it as an expense instead". Tap it: the expense form opens for that account.
20. On an account screen tap Reconcile: the same sheet opens, showing what CUE has, so you can check it against your statement.

Logging (Quick Add)
21. Under the net worth card are four round buttons: Expense, Income, Transfer, More. Tap Expense: the amount field is open with the number keypad.
22. Tap ₹250, type "Swiggy dinner": Food & delivery is picked for you. Tap Save. The sheet closes, a message says "Expense saved · Undo", and your net worth and that account update.
23. Log another expense, then tap Undo in the message: it disappears and the balances go back.
24. Log an Income: Source "Salary", it lands in a bank account. Net worth goes up.
25. Log a Transfer from Bank to Cash: both balances change, net worth stays the same.
26. Pick a past day on the date row, then tap the + button: the new entry is dated that day.
27. Log "Uber" from a particular account. Next time you type "Uber", the same category and account are picked for you.
28. Spend more than an account holds: it still saves, and the message adds "This takes [account] to −₹… Update the balance?".
29. Start typing an expense, then tap outside the sheet: CUE asks "Discard this entry?".
30. Try to save with no amount, or a transfer to the same account: a short message appears under the field, not a pop-up.
31. Tap the + button, then Lend / Borrow: the lending form opens with "Paid from" (Cash by default). Lend someone ₹1,000 from Cash: Cash goes down, net worth stays the same, and they show in Khata.

Transactions
32. The TODAY card lists today's latest five entries: expenses with "−", income with "+", transfers as "Bank → Cash".
33. Tap an entry: its details open with Edit, Duplicate and Delete. Edit the amount and the date to last week: the balances and the day it shows on change.
34. Tap Duplicate: a new entry opens with the same details. Save it.
35. Tap Delete: CUE asks "Delete [name], ₹… on [date]? Your [account] balance and net worth will update." Delete, then tap Undo within 5 seconds: it comes back.
36. Tap View all: Transactions shows entries grouped by day with totals. Try the filters (30 days / 3 months / 1 year, Expenses, Income, an account, a category).
37. Search for part of a name, an amount (for example "250") or a note: matching entries show.
38. On Today, tap Search under the date row: Transactions opens with the search box ready.

Khata
39. Settle a lent entry in Khata and choose Cash or UPI: the money goes back into Cash or the bank, and what's owed to you goes down.
40. Settle a borrowed entry: the money comes out of Cash or the bank, and what you owe goes down. It is not listed as a spend.

Everywhere
41. Turn on airplane mode and pull down on Today: your figures stay on screen and nothing goes blank. Fully close CUE, reopen it still in airplane mode: each card says "Couldn't load…" with Try again, on its own. Turn airplane mode off and tap Try again: the card fills in.
42. "A note from CUE" says "CUE is getting to know your patterns."
