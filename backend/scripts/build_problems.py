"""Builds app/data/problems.json — the coding lab's problem bank.

Every expected output is produced by running the trusted reference solution below on the test input,
so test cases can't drift from the problem statement. Run after editing a problem:

    python scripts/build_problems.py

(This script runs only our own reference code locally. User code is never executed by the backend.)
"""

from __future__ import annotations

import heapq
import gzip
import json
import random
from bisect import bisect_left
from collections import Counter, deque
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "data" / "problems.json.gz"
PROBLEMS: list[dict] = []


def problem(**meta):
    def deco(fn):
        meta["solve"] = fn
        PROBLEMS.append(meta)
        return fn
    return deco


def ints(s: str) -> list[int]:
    return [int(x) for x in s.split()]


def arr_input(a: list[int], *extra: int) -> str:
    head = " ".join(str(x) for x in (len(a), *extra))
    return f"{head}\n{' '.join(map(str, a))}\n"


R = random.Random(2026)
BIG = 100_000  # large enough that O(n²) solutions time out, small enough to keep the bank compact


# ======================= EASY =======================
@problem(
    slug="two-sum", title="Two Sum", difficulty="Easy", topic="Arrays & Hashing",
    statement="Given an array of integers and a target, find the two **distinct positions** whose values add up to the target. Exactly one valid pair exists.",
    input_format="First line: `n target`. Second line: `n` integers.",
    output_format="Two 0-based indices `i j` with `i < j`, separated by a space.",
    constraints="2 ≤ n ≤ 2·10^5, |values| ≤ 10^9. Exactly one answer exists.",
    hints=["A brute-force double loop is O(n²). Can you remember values you've already seen?",
           "For each value x, the partner you need is target − x. Store seen values in a hash map from value to index."],
    explanation="Scan once, keeping a dictionary `seen[value] = index`. For each element `x` at index `j`, check whether `target - x` is in `seen`; if so, print `seen[target-x] j`. Insert `x` after the check so an element is never paired with itself. Time O(n), space O(n).",
    expected_complexity="O(n) time, O(n) space",
    samples=[("4 9\n2 7 11 15\n", "2 + 7 = 9, at indices 0 and 1."), ("3 6\n3 2 4\n", "2 + 4 = 6.")],
)
def two_sum(inp):
    lines = inp.split("\n")
    n, target = ints(lines[0])
    a = ints(lines[1])
    seen = {}
    for j, x in enumerate(a):
        if target - x in seen:
            return f"{seen[target - x]} {j}"
        seen.setdefault(x, j)
    raise ValueError("no pair")


def two_sum_case(n):
    # Distinct even values => no accidental pairs; then plant one odd pair summing to an odd target.
    vals = R.sample(range(-10**9 // 2, 10**9 // 2), n)
    vals = [v * 2 for v in vals][: n]
    i, j = sorted(R.sample(range(n), 2))
    taken = set(vals)
    partner = 2 * R.randint(-10**8, 10**8)
    while partner in taken:  # the even partner must be unique so exactly one pair works
        partner = 2 * R.randint(-10**8, 10**8)
    vals[i], vals[j] = 2 * R.randint(-10**8, 10**8) + 1, partner
    target = vals[i] + vals[j]  # odd: only an odd+even pair can make it, and there is one odd value
    return arr_input(vals, target)


two_sum_tests = ["2 0\n-5 5\n", "5 10\n1 2 3 4 6\n", two_sum_case(10), two_sum_case(1000), two_sum_case(BIG)]


@problem(
    slug="valid-parentheses", title="Valid Brackets", difficulty="Easy", topic="Stacks",
    statement="A string contains only the characters `()[]{}`. It is **valid** if every opening bracket is closed by the same type of bracket in the correct order. Decide whether the string is valid.",
    input_format="A single line with the bracket string (it may be empty).",
    output_format="`true` or `false`.",
    constraints="0 ≤ length ≤ 10^6",
    hints=["The most recently opened bracket must be closed first. Which data structure gives you 'last in, first out'?",
           "Push opening brackets on a stack. On a closing bracket, the top of the stack must be its matching opener. At the end the stack must be empty."],
    explanation="Use a stack. Push each opening bracket. For a closing bracket, if the stack is empty or its top isn't the matching opener, the string is invalid; otherwise pop. The string is valid only if the stack is empty at the end. O(n) time, O(n) space.",
    expected_complexity="O(n) time, O(n) space",
    samples=[("()[]{}\n", "Each pair closes immediately."), ("([)]\n", "`)` closes `(` while `[` is still open.")],
)
def valid_parentheses(inp):
    s = inp.strip("\n")
    pairs = {")": "(", "]": "[", "}": "{"}
    st = []
    for ch in s:
        if ch in "([{":
            st.append(ch)
        elif not st or st.pop() != pairs[ch]:
            return "false"
    return "true" if not st else "false"


def brackets(n, valid=True):
    if valid:
        out, st = [], []
        for _ in range(n // 2):
            if st and R.random() < 0.5:
                out.append({"(": ")", "[": "]", "{": "}"}[st.pop()])
            else:
                c = R.choice("([{")
                st.append(c)
                out.append(c)
        out += [{"(": ")", "[": "]", "{": "}"}[c] for c in reversed(st)]
        return "".join(out)
    return "".join(R.choice("()[]{}") for _ in range(n))


valid_parentheses_tests = ["\n", "(\n", "]\n", "{[()()]}\n", "((((((((((\n", brackets(1000) + "\n",
                           brackets(1000) + ")\n", brackets(BIG * 3) + "\n", brackets(2000, False) + "\n"]


@problem(
    slug="palindrome-check", title="Clean Palindrome", difficulty="Easy", topic="Two Pointers",
    statement="Decide whether a sentence is a palindrome after converting letters to lowercase and **ignoring every character that isn't a letter or digit**.",
    input_format="A single line of text (ASCII).",
    output_format="`YES` or `NO`.",
    constraints="1 ≤ length ≤ 2·10^5",
    hints=["You don't need to build a cleaned copy — two pointers can skip characters as they go.",
           "Move a left pointer forward and a right pointer backward, skipping non-alphanumeric characters, and compare lowercase letters."],
    explanation="Use two pointers from both ends. Skip characters that aren't alphanumeric, compare the lowercase characters, and stop at the first mismatch. O(n) time, O(1) extra space.",
    expected_complexity="O(n) time, O(1) space",
    samples=[("A man, a plan, a canal: Panama\n", "Cleaned: `amanaplanacanalpanama`."), ("race a car\n", "Cleaned: `raceacar` is not a palindrome.")],
)
def palindrome(inp):
    s = [c.lower() for c in inp.rstrip("\n") if c.isalnum()]
    return "YES" if s == s[::-1] else "NO"


def pal_case(n, ok):
    half = "".join(R.choice("abcXYZ019 ,.!") for _ in range(n // 2))
    s = half + R.choice(["", "q"]) + half[::-1]
    if not ok:
        s = s[:-1] + ("#" if s[-1].isalnum() else "") + "Z"
        s = "y" + s
    return s + "\n"


palindrome_tests = [" \n", "a\n", "ab\n", "0P\n", "No 'x' in Nixon\n", pal_case(1000, True), pal_case(1000, False),
                    pal_case(BIG - 1000, True)]


@problem(
    slug="second-largest", title="Second Largest Distinct", difficulty="Easy", topic="Arrays & Hashing",
    statement="Find the second largest **distinct** value in an array. If the array has fewer than two distinct values, print `NONE`.",
    input_format="First line: `n`. Second line: `n` integers.",
    output_format="The second largest distinct value, or `NONE`.",
    constraints="1 ≤ n ≤ 2·10^5, |values| ≤ 10^9",
    hints=["Sorting works but is O(n log n). Can you do it in one pass?",
           "Track the largest and second-largest distinct values seen so far, updating them as you scan."],
    explanation="Keep `first` and `second` (initially none). For each x: if x > first, shift first into second; else if x < first and x > second, update second. Equal values are ignored so values stay distinct. O(n) time, O(1) space.",
    expected_complexity="O(n) time, O(1) space",
    samples=[("5\n3 9 9 1 4\n", "Distinct values are 1,3,4,9 — second largest is 4."), ("3\n7 7 7\n", "Only one distinct value.")],
)
def second_largest(inp):
    a = ints(inp.split("\n")[1])
    d = sorted(set(a))
    return str(d[-2]) if len(d) >= 2 else "NONE"


second_largest_tests = ["1\n5\n", "2\n-1 -1\n", "2\n-1 -2\n", "4\n1000000000 -1000000000 0 0\n",
                        arr_input([R.randint(-10**9, 10**9) for _ in range(BIG)]),
                        arr_input([5] * 100000 + [6])]


@problem(
    slug="binary-search", title="Find Positions", difficulty="Easy", topic="Binary Search",
    statement="You're given a sorted array of **distinct** integers and several queries. For each query value, print its 0-based index in the array, or `-1` if it is absent.",
    input_format="Line 1: `n q`. Line 2: `n` sorted distinct integers. Line 3: `q` query integers.",
    output_format="`q` lines, one answer per query.",
    constraints="1 ≤ n, q ≤ 2·10^5, |values| ≤ 10^9",
    hints=["A linear scan per query is O(n·q) — too slow for the largest tests.",
           "Because the array is sorted, compare the query to the middle element and discard half the range each step."],
    explanation="Classic binary search per query: keep `lo, hi`; compare with `a[mid]`; move the bound accordingly. O(log n) per query, O(q log n) total. (A hash map from value to index is also O(n + q).)",
    expected_complexity="O((n + q) log n) time",
    samples=[("5 3\n-3 0 4 9 12\n4 5 -3\n", "4 is at index 2, 5 is absent, -3 is at index 0.")],
)
def bsearch(inp):
    lines = inp.split("\n")
    a = ints(lines[1])
    out = []
    for x in ints(lines[2]):
        i = bisect_left(a, x)
        out.append(str(i if i < len(a) and a[i] == x else -1))
    return "\n".join(out)


def bs_case(n, q):
    a = sorted(R.sample(range(-10**9, 10**9), n))
    qs = [R.choice(a) if R.random() < 0.5 else R.randint(-10**9, 10**9) for _ in range(q)]
    return f"{n} {q}\n{' '.join(map(str, a))}\n{' '.join(map(str, qs))}\n"


bsearch_tests = ["1 2\n7\n7 8\n", "3 3\n1 2 3\n0 3 4\n", bs_case(100, 50), bs_case(BIG, BIG)]


@problem(
    slug="fizzbuzz-count", title="FizzBuzz Counter", difficulty="Easy", topic="Math",
    statement="For the numbers 1..n, count how many would be printed as `Fizz` (divisible by 3 only), `Buzz` (by 5 only), `FizzBuzz` (by both) and how many stay as plain numbers.",
    input_format="A single integer `n`.",
    output_format="Four integers on one line: `fizz buzz fizzbuzz numbers`.",
    constraints="1 ≤ n ≤ 10^18",
    hints=["n can be 10^18, so looping is impossible. Think about counting multiples directly.",
           "There are ⌊n/3⌋ multiples of 3, ⌊n/5⌋ of 5 and ⌊n/15⌋ of 15. Use inclusion–exclusion."],
    explanation="Let a = n//3, b = n//5, c = n//15. FizzBuzz = c, Fizz = a − c, Buzz = b − c, numbers = n − (a + b − c). Constant time. In languages with 64-bit integers use `long long`/`long`.",
    expected_complexity="O(1) time",
    samples=[("15\n", "Fizz: 3,6,9,12. Buzz: 5,10. FizzBuzz: 15. Numbers: 8 others.")],
)
def fizz(inp):
    n = int(inp.strip())
    a, b, c = n // 3, n // 5, n // 15
    return f"{a - c} {b - c} {c} {n - (a + b - c)}"


fizz_tests = ["1\n", "3\n", "5\n", "30\n", "1000000\n", "1000000000000000000\n", "999999999999999989\n"]


# ======================= MEDIUM =======================
@problem(
    slug="max-subarray", title="Maximum Subarray Sum", difficulty="Medium", topic="Dynamic Programming",
    statement="Find the largest possible sum of a **non-empty contiguous** subarray.",
    input_format="First line: `n`. Second line: `n` integers.",
    output_format="The maximum subarray sum.",
    constraints="1 ≤ n ≤ 2·10^5, |values| ≤ 10^9 (use 64-bit integers)",
    hints=["Checking every subarray is O(n²). What's the best sum of a subarray that *ends* at position i?",
           "best_ending_here = max(a[i], best_ending_here + a[i]) — Kadane's algorithm. Track the overall maximum too."],
    explanation="Kadane's algorithm: `cur = max(x, cur + x)`, `best = max(best, cur)`. If all numbers are negative, the answer is the largest single element, which this handles because subarrays must be non-empty. O(n) time, O(1) space.",
    expected_complexity="O(n) time, O(1) space",
    samples=[("9\n-2 1 -3 4 -1 2 1 -5 4\n", "The subarray 4 -1 2 1 sums to 6."), ("3\n-5 -2 -9\n", "All negative: best is -2.")],
)
def max_sub(inp):
    a = ints(inp.split("\n")[1])
    best = cur = a[0]
    for x in a[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return str(best)


max_sub_tests = ["1\n-7\n", "4\n1 2 3 4\n", arr_input([R.randint(-100, 100) for _ in range(1000)]),
                 arr_input([R.randint(-10**9, 10**9) for _ in range(BIG)]), arr_input([10**9] * BIG)]


@problem(
    slug="longest-unique-substring", title="Longest Substring Without Repeats", difficulty="Medium", topic="Sliding Window",
    statement="Find the length of the longest substring that contains **no repeated characters**.",
    input_format="A single line string (printable ASCII, may contain spaces; may be empty).",
    output_format="One integer.",
    constraints="0 ≤ length ≤ 2·10^5",
    hints=["Try a window [left, right] that always contains unique characters.",
           "Store the last index of each character. When s[right] was seen inside the window, jump left past that index."],
    explanation="Sliding window with a map `last[ch]`. For each right index: if `last[ch] >= left`, set `left = last[ch] + 1`. Update `last[ch] = right` and the best length `right - left + 1`. O(n) time.",
    expected_complexity="O(n) time, O(k) space",
    samples=[("abcabcbb\n", "`abc` has length 3."), ("pwwkew\n", "`wke` has length 3.")],
)
def longest_unique(inp):
    s = inp.rstrip("\n")
    last, left, best = {}, 0, 0
    for i, ch in enumerate(s):
        if last.get(ch, -1) >= left:
            left = last[ch] + 1
        last[ch] = i
        best = max(best, i - left + 1)
    return str(best)


longest_unique_tests = ["\n", "aaaa\n", "a b c a\n", "dvdf\n", "".join(R.choice("abcdefghij") for _ in range(5000)) + "\n",
                        "".join(chr(R.randint(33, 126)) for _ in range(BIG)) + "\n"]


@problem(
    slug="merge-intervals", title="Merge Intervals", difficulty="Medium", topic="Sorting",
    statement="Merge all overlapping intervals. Two intervals overlap if they share at least one point (e.g. `[1,3]` and `[3,5]` merge into `[1,5]`).",
    input_format="First line: `n`. Next `n` lines: `start end` with start ≤ end.",
    output_format="The merged intervals in increasing order, one `start end` per line.",
    constraints="1 ≤ n ≤ 10^5, 0 ≤ start ≤ end ≤ 10^9",
    hints=["Sorting by start time lines intervals up so overlaps are neighbours.",
           "Walk the sorted list; if the next interval starts at or before the current end, extend the end; otherwise start a new interval."],
    explanation="Sort by start. Keep the current merged interval; for each next interval, if `start <= cur_end` set `cur_end = max(cur_end, end)`, else output the current one and start a new one. O(n log n).",
    expected_complexity="O(n log n) time",
    samples=[("4\n1 3\n2 6\n8 10\n15 18\n", "[1,3] and [2,6] overlap."), ("2\n1 4\n4 5\n", "Touching intervals merge.")],
)
def merge_intervals(inp):
    lines = inp.strip().split("\n")
    iv = sorted(tuple(ints(line)) for line in lines[1:])
    out = []
    cs, ce = iv[0]
    for s, e in iv[1:]:
        if s <= ce:
            ce = max(ce, e)
        else:
            out.append(f"{cs} {ce}")
            cs, ce = s, e
    out.append(f"{cs} {ce}")
    return "\n".join(out)


def iv_case(n, span):
    rows = []
    for _ in range(n):
        s = R.randint(0, span)
        rows.append(f"{s} {s + R.randint(0, span // 50 + 1)}")
    return f"{n}\n" + "\n".join(rows) + "\n"


merge_tests = ["1\n5 5\n", "3\n1 10\n2 3\n4 5\n", "3\n7 8\n1 2\n4 5\n", iv_case(200, 1000), iv_case(100000, 10**9)]


@problem(
    slug="kth-largest", title="K-th Largest Element", difficulty="Medium", topic="Heaps",
    statement="Return the k-th largest element of the array (counting duplicates; k = 1 is the maximum).",
    input_format="First line: `n k`. Second line: `n` integers.",
    output_format="One integer.",
    constraints="1 ≤ k ≤ n ≤ 2·10^5, |values| ≤ 10^9",
    hints=["Sorting is O(n log n) and passes, but a heap lets you do O(n log k).",
           "Keep a min-heap of the k largest values seen; its top is the answer."],
    explanation="Maintain a min-heap of size k: push each value, and pop when the size exceeds k. The heap's minimum is the k-th largest. O(n log k). Quickselect gives average O(n).",
    expected_complexity="O(n log k) time, O(k) space",
    samples=[("6 2\n3 2 1 5 6 4\n", "Sorted descending: 6, 5, … — the 2nd largest is 5."), ("9 4\n3 2 3 1 2 4 5 5 6\n", "6,5,5,4 → 4.")],
)
def kth(inp):
    lines = inp.split("\n")
    n, k = ints(lines[0])
    return str(heapq.nlargest(k, ints(lines[1]))[-1])


kth_tests = ["1 1\n-4\n", "5 5\n5 4 3 2 1\n", arr_input([R.randint(-50, 50) for _ in range(500)], 250),
             arr_input([R.randint(-10**9, 10**9) for _ in range(BIG)], 77777)]


@problem(
    slug="number-of-islands", title="Count Islands", difficulty="Medium", topic="Graphs",
    statement="A grid map has land `#` and water `.`. An island is a group of land cells connected **horizontally or vertically**. Count the islands.",
    input_format="First line: `rows cols`. Next `rows` lines: strings of `#` and `.`.",
    output_format="The number of islands.",
    constraints="1 ≤ rows, cols ≤ 1000",
    hints=["Every time you find an unvisited land cell you've found a new island. Then mark its whole island as visited.",
           "Use BFS or an iterative DFS (a recursive DFS can overflow the stack on a 1000×1000 grid)."],
    explanation="Scan cells; on unvisited land, increment the count and flood-fill (BFS with a queue) to mark all connected land. Each cell is visited once: O(rows·cols).",
    expected_complexity="O(rows·cols) time and space",
    samples=[("4 5\n##...\n##...\n..#..\n...##\n", "Three separate islands.")],
)
def islands(inp):
    lines = inp.strip("\n").split("\n")
    r, c = ints(lines[0])
    g = [list(row) for row in lines[1:1 + r]]
    count = 0
    for i in range(r):
        for j in range(c):
            if g[i][j] == "#":
                count += 1
                g[i][j] = "."
                dq = deque([(i, j)])
                while dq:
                    x, y = dq.popleft()
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < r and 0 <= ny < c and g[nx][ny] == "#":
                            g[nx][ny] = "."
                            dq.append((nx, ny))
    return str(count)


def grid(r, c, p):
    return f"{r} {c}\n" + "\n".join("".join("#" if R.random() < p else "." for _ in range(c)) for _ in range(r)) + "\n"


islands_tests = ["1 1\n.\n", "1 1\n#\n", "3 3\n#.#\n.#.\n#.#\n", grid(50, 60, 0.4), grid(700, 700, 0.45),
                 "2 1000\n" + "#" * 1000 + "\n" + "#" * 1000 + "\n"]


@problem(
    slug="coin-change", title="Fewest Coins", difficulty="Medium", topic="Dynamic Programming",
    statement="Given coin denominations (unlimited supply of each) and an amount, find the **fewest coins** that add up to exactly the amount, or `-1` if it's impossible.",
    input_format="First line: `k amount`. Second line: `k` coin values.",
    output_format="One integer.",
    constraints="1 ≤ k ≤ 50, 1 ≤ coin ≤ 10^4, 0 ≤ amount ≤ 10^5",
    hints=["Greedy (always take the biggest coin) fails for coins like 1, 3, 4 and amount 6.",
           "Let dp[x] be the fewest coins for amount x. dp[0] = 0 and dp[x] = 1 + min(dp[x − c]) over coins c ≤ x."],
    explanation="Bottom-up DP over amounts 0..amount: `dp[x] = min(dp[x-c] + 1)` for each coin. Unreachable amounts stay infinite → print -1. O(k·amount) time, O(amount) space.",
    expected_complexity="O(k·amount) time, O(amount) space",
    samples=[("3 11\n1 2 5\n", "5 + 5 + 1."), ("1 3\n2\n", "Odd amounts can't be made with 2s."), ("3 6\n1 3 4\n", "3 + 3 (greedy would use 4+1+1).")],
)
def coin(inp):
    lines = inp.split("\n")
    k, amount = ints(lines[0])
    coins = ints(lines[1])
    INF = float("inf")
    dp = [0] + [INF] * amount
    for x in range(1, amount + 1):
        for cv in coins:
            if cv <= x and dp[x - cv] + 1 < dp[x]:
                dp[x] = dp[x - cv] + 1
    return str(dp[amount] if dp[amount] != INF else -1)


coin_tests = ["1 0\n7\n", "2 7\n2 4\n", "4 99\n1 7 10 25\n", "3 100000\n7 13 29\n",
              f"20 100000\n{' '.join(str(R.randint(2, 10000)) for _ in range(20))}\n"]


@problem(
    slug="grid-shortest-path", title="Shortest Path in a Maze", difficulty="Medium", topic="Graphs",
    statement="Find the fewest moves from `S` to `E` in a grid. You can move up, down, left or right onto open cells (`.`, `S`, `E`); `#` is a wall.",
    input_format="First line: `rows cols`. Next `rows` lines describe the maze. There is exactly one `S` and one `E`.",
    output_format="The minimum number of moves, or `-1` if `E` can't be reached.",
    constraints="1 ≤ rows, cols ≤ 1000",
    hints=["All moves cost the same. Which search finds shortest paths in unweighted graphs?",
           "BFS from S, storing the distance to each cell the first time you reach it."],
    explanation="Breadth-first search from `S`: the first time BFS reaches a cell is via a shortest path. Stop when `E` is dequeued. O(rows·cols).",
    expected_complexity="O(rows·cols) time and space",
    samples=[("3 4\nS..#\n.#..\n...E\n", "One shortest route takes 5 moves."), ("1 3\nS#E\n", "The wall blocks the only route.")],
)
def maze(inp):
    lines = inp.strip("\n").split("\n")
    r, c = ints(lines[0])
    g = lines[1:1 + r]
    for i in range(r):
        if "S" in g[i]:
            si, sj = i, g[i].index("S")
    dist = [[-1] * c for _ in range(r)]
    dist[si][sj] = 0
    dq = deque([(si, sj)])
    while dq:
        x, y = dq.popleft()
        if g[x][y] == "E":
            return str(dist[x][y])
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < r and 0 <= ny < c and g[nx][ny] != "#" and dist[nx][ny] < 0:
                dist[nx][ny] = dist[x][y] + 1
                dq.append((nx, ny))
    return "-1"


def maze_case(r, c, p):
    rows = [["#" if R.random() < p else "." for _ in range(c)] for _ in range(r)]
    rows[0][0], rows[r - 1][c - 1] = "S", "E"
    return f"{r} {c}\n" + "\n".join("".join(x) for x in rows) + "\n"


maze_tests = ["1 2\nSE\n", "2 2\nS#\n#E\n", maze_case(20, 30, 0.25), maze_case(700, 700, 0.3), maze_case(500, 500, 0.0)]


@problem(
    slug="product-except-self", title="Product of Others", difficulty="Medium", topic="Arrays & Hashing",
    statement="For each position i, output the product of all elements **except** a[i], **without using division**. Print results modulo 1 000 000 007 (as non-negative numbers).",
    input_format="First line: `n`. Second line: `n` integers.",
    output_format="`n` integers on one line.",
    constraints="2 ≤ n ≤ 2·10^5, 0 ≤ values ≤ 10^9",
    hints=["The answer for i is (product of everything to the left) × (product of everything to the right).",
           "Build prefix products in one pass and suffix products in another, taking the modulus as you go."],
    explanation="`left[i]` = product of a[0..i−1], `right[i]` = product of a[i+1..n−1] (all mod M). The answer is `left[i]·right[i] mod M`. Zeros are handled naturally, unlike the division trick. O(n).",
    expected_complexity="O(n) time",
    samples=[("4\n1 2 3 4\n", "24 = 2·3·4, 12 = 1·3·4, …"), ("3\n0 5 2\n", "Only position 0 avoids the zero.")],
)
def product_except(inp):
    M = 10**9 + 7
    a = ints(inp.split("\n")[1])
    n = len(a)
    left = [1] * n
    for i in range(1, n):
        left[i] = left[i - 1] * a[i - 1] % M
    out = [0] * n
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] = left[i] * right % M
        right = right * a[i] % M
    return " ".join(map(str, out))


product_tests = ["2\n0 0\n", "2\n7 9\n", arr_input([R.randint(0, 10) for _ in range(100)]),
                 arr_input([R.randint(1, 10**9) for _ in range(BIG)])]


# ======================= HARD =======================
@problem(
    slug="longest-increasing-subsequence", title="Longest Increasing Subsequence", difficulty="Hard", topic="Dynamic Programming",
    statement="Find the length of the longest **strictly increasing** subsequence (elements in order, not necessarily adjacent).",
    input_format="First line: `n`. Second line: `n` integers.",
    output_format="One integer.",
    constraints="1 ≤ n ≤ 2·10^5, |values| ≤ 10^9",
    hints=["The O(n²) DP (dp[i] = 1 + max dp[j] for j < i with a[j] < a[i]) is too slow for n = 2·10^5.",
           "Keep tails[L] = the smallest possible tail of an increasing subsequence of length L+1. For each x, binary-search the first tail ≥ x and replace it."],
    explanation="Patience sorting: maintain `tails`, which stays sorted. For each x, find `i = lower_bound(tails, x)`; if i == len(tails) append, else set `tails[i] = x`. The answer is `len(tails)`. O(n log n).",
    expected_complexity="O(n log n) time, O(n) space",
    samples=[("8\n10 9 2 5 3 7 101 18\n", "e.g. 2, 3, 7, 101."), ("4\n7 7 7 7\n", "Strictly increasing, so just 1.")],
)
def lis(inp):
    tails = []
    for x in ints(inp.split("\n")[1]):
        i = bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return str(len(tails))


lis_tests = ["1\n5\n", "5\n1 2 3 4 5\n", "5\n5 4 3 2 1\n", arr_input([R.randint(1, 100) for _ in range(2000)]),
             arr_input([R.randint(-10**9, 10**9) for _ in range(BIG)]), arr_input(list(range(BIG)))]


@problem(
    slug="edit-distance", title="Edit Distance", difficulty="Hard", topic="Dynamic Programming",
    statement="Find the minimum number of single-character **insertions, deletions or substitutions** needed to turn word A into word B.",
    input_format="Two lines: word A and word B (lowercase letters; either may be empty).",
    output_format="One integer.",
    constraints="0 ≤ |A|, |B| ≤ 3000",
    hints=["Think about the last characters: if they match, no edit is needed for them; otherwise you try all three edits.",
           "dp[i][j] = edits to turn A[:i] into B[:j]. Only the previous row is needed, so memory can be O(|B|)."],
    explanation="Levenshtein DP: `dp[i][j] = dp[i-1][j-1]` if A[i-1]==B[j-1], else `1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])`. Base cases: dp[i][0]=i, dp[0][j]=j. O(|A|·|B|) time, O(|B|) space with a rolling row.",
    expected_complexity="O(|A|·|B|) time, O(|B|) space",
    samples=[("horse\nros\n", "horse → rorse → rose → ros."), ("intention\nexecution\n", "5 edits.")],
)
def edit(inp):
    parts = inp.split("\n")
    a, b = parts[0], parts[1] if len(parts) > 1 else ""
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        ai = a[i - 1]
        for j in range(1, len(b) + 1):
            cur[j] = prev[j - 1] if ai == b[j - 1] else 1 + min(prev[j], cur[j - 1], prev[j - 1])
        prev = cur
    return str(prev[len(b)])


def word(n):
    return "".join(R.choice("abcde") for _ in range(n))


edit_tests = ["\nabc\n", "abc\n\n", "same\nsame\n", f"{word(200)}\n{word(180)}\n", f"{word(2000)}\n{word(2000)}\n"]


@problem(
    slug="dijkstra", title="Cheapest Routes", difficulty="Hard", topic="Graphs",
    statement="A directed graph has `n` cities (1..n) and `m` roads with non-negative tolls. Print the cheapest total toll from city 1 to every city.",
    input_format="First line: `n m`. Next `m` lines: `u v w` — a road from u to v with toll w.",
    output_format="`n` integers on one line: the cheapest cost to cities 1..n, or `-1` if unreachable.",
    constraints="1 ≤ n ≤ 10^5, 0 ≤ m ≤ 2·10^5, 0 ≤ w ≤ 10^9 (use 64-bit integers)",
    hints=["BFS only works when every edge costs the same.",
           "Dijkstra's algorithm with a priority queue: always expand the cheapest known city next; skip stale queue entries."],
    explanation="Dijkstra with a binary heap: dist[1]=0; pop (d,u); if d > dist[u] skip; relax each edge (u,v,w). O((n + m) log n).",
    expected_complexity="O((n + m) log n) time",
    samples=[("4 4\n1 2 5\n1 3 1\n3 2 2\n2 4 1\n", "1→3→2 costs 3, then →4 costs 4."), ("3 1\n2 3 4\n", "Nothing leaves city 1.")],
)
def dijkstra(inp):
    data = inp.split()
    n, m = int(data[0]), int(data[1])
    adj = [[] for _ in range(n + 1)]
    for i in range(m):
        u, v, w = int(data[2 + 3 * i]), int(data[3 + 3 * i]), int(data[4 + 3 * i])
        adj[u].append((v, w))
    INF = float("inf")
    dist = [INF] * (n + 1)
    dist[1] = 0
    pq = [(0, 1)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w
                heapq.heappush(pq, (dist[v], v))
    return " ".join(str(x if x != INF else -1) for x in dist[1:])


def graph(n, m, wmax):
    edges = [f"{R.randint(1, n)} {R.randint(1, n)} {R.randint(0, wmax)}" for _ in range(m)]
    return f"{n} {m}\n" + "\n".join(edges) + ("\n" if edges else "")


dijkstra_tests = ["1 0\n", "2 1\n1 2 0\n", "3 3\n1 2 10\n2 3 10\n1 3 25\n", graph(100, 300, 100),
                  graph(100000, BIG, 10**9)]


@problem(
    slug="trapping-rain-water", title="Trapping Rain Water", difficulty="Hard", topic="Two Pointers",
    statement="Bars of width 1 have the given heights. After it rains, how many units of water are trapped between the bars?",
    input_format="First line: `n`. Second line: `n` non-negative heights.",
    output_format="One integer (may need 64 bits).",
    constraints="1 ≤ n ≤ 2·10^5, 0 ≤ height ≤ 10^9",
    hints=["Water above bar i is min(highest bar to its left, highest bar to its right) − height[i].",
           "Two pointers: move the side with the lower max inward — that side's water level is already decided."],
    explanation="Keep `left`, `right`, `left_max`, `right_max`. If `left_max <= right_max`, water at `left` is `left_max - h[left]` (after updating left_max), then advance left; otherwise do the same on the right. O(n) time, O(1) space.",
    expected_complexity="O(n) time, O(1) space",
    samples=[("12\n0 1 0 2 1 0 1 3 2 1 2 1\n", "6 units are trapped."), ("6\n4 2 0 3 2 5\n", "9 units.")],
)
def trap(inp):
    h = ints(inp.split("\n")[1])
    l, r = 0, len(h) - 1
    lm = rm = total = 0
    while l <= r:
        if lm <= rm:
            lm = max(lm, h[l])
            total += lm - h[l]
            l += 1
        else:
            rm = max(rm, h[r])
            total += rm - h[r]
            r -= 1
    return str(total)


trap_tests = ["1\n5\n", "3\n3 0 3\n", "5\n1 2 3 4 5\n", arr_input([R.randint(0, 20) for _ in range(1000)]),
              arr_input([R.randint(0, 10**9) for _ in range(BIG)])]


@problem(
    slug="sliding-window-maximum", title="Sliding Window Maximum", difficulty="Hard", topic="Sliding Window",
    statement="For every window of `k` consecutive elements, output the maximum.",
    input_format="First line: `n k`. Second line: `n` integers.",
    output_format="`n − k + 1` integers on one line.",
    constraints="1 ≤ k ≤ n ≤ 2·10^5, |values| ≤ 10^9",
    hints=["Recomputing each window's max is O(n·k) — too slow when k is large.",
           "Keep a deque of indices whose values are decreasing. Drop indices that leave the window from the front and smaller values from the back."],
    explanation="Monotonic deque: for each i, pop from the back while `a[back] <= a[i]`, push i, pop the front if it's outside the window, and once `i >= k-1` output `a[front]`. Each index enters and leaves once: O(n).",
    expected_complexity="O(n) time, O(k) space",
    samples=[("8 3\n1 3 -1 -3 5 3 6 7\n", "Windows: [1,3,-1]→3, [3,-1,-3]→3, …")],
)
def window_max(inp):
    lines = inp.split("\n")
    n, k = ints(lines[0])
    a = ints(lines[1])
    dq, out = deque(), []
    for i, x in enumerate(a):
        while dq and a[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            out.append(a[dq[0]])
    return " ".join(map(str, out))


window_tests = ["1 1\n-5\n", "5 5\n1 5 2 4 3\n", "5 1\n1 5 2 4 3\n", arr_input([R.randint(-100, 100) for _ in range(500)], 20),
                arr_input([R.randint(-10**9, 10**9) for _ in range(BIG)], 50000)]


@problem(
    slug="anagram-groups", title="Anagram Groups", difficulty="Medium", topic="Arrays & Hashing",
    statement="Words are in the same group if they are anagrams of each other (same letters with the same counts). Print the number of groups and the size of the largest group.",
    input_format="First line: `n`. Second line: `n` lowercase words separated by spaces.",
    output_format="Two integers: `groups largest`.",
    constraints="1 ≤ n ≤ 10^5, 1 ≤ word length ≤ 20",
    hints=["Two words are anagrams exactly when their sorted letters are equal.",
           "Use the sorted word (or a 26-letter count tuple) as a hash-map key and count words per key."],
    explanation="Map each word to a canonical key (sorted characters) and count with a hash map. Groups = number of keys, largest = max count. O(n·L log L).",
    expected_complexity="O(n·L log L) time",
    samples=[("6\neat tea tan ate nat bat\n", "Groups: {eat,tea,ate}, {tan,nat}, {bat}.")],
)
def anagrams(inp):
    words = inp.split("\n")[1].split()
    c = Counter("".join(sorted(w)) for w in words)
    return f"{len(c)} {max(c.values())}"


def words_case(n):
    bases = ["".join(R.choice("abcdefgh") for _ in range(R.randint(1, 6))) for _ in range(max(1, n // 4))]
    out = []
    for _ in range(n):
        w = list(R.choice(bases))
        R.shuffle(w)
        out.append("".join(w))
    return f"{n}\n{' '.join(out)}\n"


anagram_tests = ["1\na\n", "3\nab ba ab\n", "4\nabc def ghi jkl\n", words_case(1000), words_case(100000)]


@problem(
    slug="reverse-words", title="Reverse the Words", difficulty="Easy", topic="Strings",
    statement="Reverse the order of the words in a sentence. Words are separated by one or more spaces; the output must use **single spaces** with no leading or trailing spaces.",
    input_format="A single line of text.",
    output_format="The words in reverse order.",
    constraints="1 ≤ length ≤ 2·10^5. The line contains at least one word.",
    hints=["Splitting on whitespace (not on a single space) automatically drops empty pieces.",
           "Split into words, reverse the list, and join with one space."],
    explanation="`' '.join(reversed(line.split()))`. Splitting on runs of whitespace removes extra spaces. O(n).",
    expected_complexity="O(n) time",
    samples=[("the sky is blue\n", "Reversed word order."), ("  hello   world  \n", "Extra spaces are removed.")],
)
def reverse_words(inp):
    return " ".join(reversed(inp.split()))


reverse_tests = ["a\n", "a good   example\n", "   x\n", " ".join(word(R.randint(1, 8)) for _ in range(30000)) + "\n"]

TESTS = {
    "two-sum": two_sum_tests, "valid-parentheses": valid_parentheses_tests, "palindrome-check": palindrome_tests,
    "second-largest": second_largest_tests, "binary-search": bsearch_tests, "fizzbuzz-count": fizz_tests,
    "max-subarray": max_sub_tests, "longest-unique-substring": longest_unique_tests, "merge-intervals": merge_tests,
    "kth-largest": kth_tests, "number-of-islands": islands_tests, "coin-change": coin_tests,
    "grid-shortest-path": maze_tests, "product-except-self": product_tests,
    "longest-increasing-subsequence": lis_tests, "edit-distance": edit_tests, "dijkstra": dijkstra_tests,
    "trapping-rain-water": trap_tests, "sliding-window-maximum": window_tests, "anagram-groups": anagram_tests,
    "reverse-words": reverse_tests,
}


def main():
    out = []
    for p in PROBLEMS:
        solve = p.pop("solve")
        samples = [{"input": i, "output": solve(i), "explanation": e} for i, e in p.pop("samples")]
        tests = [{"input": s["input"], "output": s["output"]} for s in samples]
        tests += [{"input": t, "output": solve(t)} for t in TESTS[p["slug"]]]
        size = sum(len(t["input"]) for t in tests)
        assert size < 6_000_000, (p["slug"], size)
        out.append({**p, "samples": samples, "tests": tests})
    order = {"Easy": 0, "Medium": 1, "Hard": 2}
    out.sort(key=lambda p: (order[p["difficulty"]], p["title"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(gzip.compress(json.dumps(out, ensure_ascii=False).encode(), compresslevel=9, mtime=0))
    print(f"Wrote {len(out)} problems, {sum(len(p['tests']) for p in out)} tests, "
          f"{OUT.stat().st_size / 1e6:.1f} MB -> {OUT}")


if __name__ == "__main__":
    main()
