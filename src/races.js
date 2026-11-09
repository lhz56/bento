// Algorithm races: hand-written, instant lessons where 2–3 algorithms solve the same problem
// and the Growth tab races them. Generated pairs keep pseudocode and code line-for-line.
export const RACES = [
 {
  "id": "race-sort",
  "q": "Which sorting algorithm is fastest?",
  "lang": "python",
  "title": "Sorting race: bubble vs insertion vs merge",
  "kicker": "algorithm race",
  "concepts": [
   "sorting",
   "big-o",
   "recursion"
  ],
  "file": "sort_race.py",
  "code": "def bubble_sort(xs):\n    xs = xs[:]\n    for i in range(len(xs)):\n        for j in range(len(xs) - 1 - i):\n            if xs[j] > xs[j + 1]:\n                xs[j], xs[j + 1] = xs[j + 1], xs[j]\n    return xs\n\ndef insertion_sort(xs):\n    xs = xs[:]\n    for i in range(1, len(xs)):\n        cur, j = xs[i], i - 1\n        while j >= 0 and xs[j] > cur:\n            xs[j + 1] = xs[j]\n            j -= 1\n        xs[j + 1] = cur\n    return xs\n\ndef merge_sort(xs):\n    if len(xs) <= 1:\n        return xs\n    mid = len(xs) // 2\n    left, right = merge_sort(xs[:mid]), merge_sort(xs[mid:])\n    out = []\n    while left and right:\n        out.append(left.pop(0) if left[0] <= right[0] else right.pop(0))\n    return out + left + right\n\nnums = [5, 2, 9, 1, 7, 3, 8, 6, 4]\nshow(nums, \"before\")\nshow(merge_sort(nums), \"after merge sort\")",
  "pseudo": [
   "Bubble sort: swap neighbours until sorted",
   "Work on a copy",
   "Make one pass per item",
   "Walk along the unsorted part",
   "If two neighbours are in the wrong order…",
   "…swap them",
   "Hand back the sorted copy",
   "",
   "Insertion sort: like sorting playing cards",
   "Work on a copy",
   "Pick up each card in turn",
   "Hold it, and look left",
   "While the card on the left is bigger…",
   "…slide it one step right",
   "…and keep looking left",
   "Drop the held card into the gap",
   "Hand back the sorted copy",
   "",
   "Merge sort: split, sort halves, merge",
   "A list of one is already sorted",
   "so hand it straight back",
   "Find the middle",
   "Sort each half (the same way!)",
   "Start an empty result",
   "While both halves still have items",
   "Take the smaller front item",
   "Add whatever is left over",
   "",
   "Some numbers to sort",
   "Draw them unsorted",
   "Draw them sorted"
  ],
  "notes": [
   {
    "from": 4,
    "to": 6,
    "label": "the slow part",
    "text": "Two loops inside each other: for 1,000 items that is about half a million comparisons."
   },
   {
    "from": 13,
    "to": 15,
    "label": "card trick",
    "text": "Fast when the list is almost sorted: each card only slides a little."
   },
   {
    "from": 22,
    "to": 23,
    "label": "divide and conquer",
    "text": "Halving again and again takes only log₂(n) levels, which is why merge sort scales."
   }
  ],
  "story": [
   {
    "t": "p",
    "md": "Three ways to sort the same list. They all give the **same answer**, but the amount of work is wildly different. Open the **Growth** tab and press **Measure** to race them on bigger and bigger lists."
   },
   {
    "t": "p",
    "md": "[[1-7|Bubble sort]] compares neighbours over and over, so its work grows like **n²**: double the list, four times the work. [[9-17|Insertion sort]] is the same in the worst case, but great on nearly sorted lists. [[19-27|Merge sort]] splits the list in half, sorts each half, then zips them together, about **n log n** work."
   },
   {
    "t": "term",
    "term": "Big-O",
    "plain": "A way to describe how the work grows as the input gets bigger, ignoring small details.",
    "like": "Asking “if the guest list doubles, how much longer is the queue?”"
   },
   {
    "t": "quiz",
    "q": "Bubble sort takes 1 second for 10,000 items. Roughly how long for 20,000?",
    "choices": [
     "2 seconds",
     "4 seconds",
     "1.3 seconds"
    ],
    "answer": 1,
    "why": "n² work: doubling n makes the work 2² = 4 times bigger."
   },
   {
    "t": "try",
    "items": [
     "Measure all three",
     "Sort an already sorted list",
     "Step through merge_sort"
    ]
   },
   {
    "t": "next",
    "items": [
     "Why is Python’s sorted() so fast?",
     "What is recursion, really?",
     "What does O(n log n) mean?"
    ]
   }
  ],
  "growth": {
   "setup": "def make_input(n):\n    return list(range(n, 0, -1))",
   "calls": [
    {
     "label": "bubble_sort",
     "call": "bubble_sort(make_input(n))"
    },
    {
     "label": "insertion_sort",
     "call": "insertion_sort(make_input(n))"
    },
    {
     "label": "merge_sort",
     "call": "merge_sort(make_input(n))"
    }
   ],
   "label": "Worst case: lists in reverse order"
  }
 },
 {
  "id": "race-search",
  "q": "Linear search vs binary search",
  "lang": "python",
  "title": "Search race: one by one vs halving",
  "kicker": "algorithm race",
  "concepts": [
   "searching",
   "big-o",
   "arrays"
  ],
  "file": "search_race.py",
  "code": "def linear_search(xs, target):\n    for i, x in enumerate(xs):\n        if x == target:\n            return i\n    return -1\n\ndef binary_search(xs, target):\n    lo, hi = 0, len(xs) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if xs[mid] == target:\n            return mid\n        if xs[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n\nnames = sorted([\"Ana\", \"Ben\", \"Cy\", \"Dee\", \"Eli\", \"Fay\", \"Gus\", \"Hal\"])\nprint(\"linear:\", linear_search(names, \"Hal\"))\nprint(\"binary:\", binary_search(names, \"Hal\"))",
  "pseudo": [
   "Linear search: check every item",
   "Go through the list from the start",
   "Is this the one?",
   "Found it: say where",
   "Not there at all",
   "",
   "Binary search: the phone-book trick",
   "Look at the whole (sorted) list",
   "While there is still a range to check",
   "Open it in the middle",
   "Is the middle the one?",
   "Found it",
   "Too small?",
   "Throw away the left half",
   "Too big?",
   "Throw away the right half",
   "Not there at all",
   "",
   "A sorted list of names",
   "Find Hal the slow way",
   "Find Hal the fast way"
  ],
  "notes": [
   {
    "from": 2,
    "to": 3,
    "label": "one at a time",
    "text": "A million items can mean a million checks."
   },
   {
    "from": 13,
    "to": 16,
    "label": "halving",
    "text": "Each check throws away half of what is left: a million items need only about 20 checks."
   }
  ],
  "story": [
   {
    "t": "p",
    "md": "Looking for a name in a list. The obvious way, [[1-5|linear search]], checks every name from the top. The clever way, [[7-17|binary search]], opens the list in the middle like a phone book and throws away the half that cannot contain the name."
   },
   {
    "t": "p",
    "md": "The catch: binary search only works if the list is **sorted**. Press **Measure** in the Growth tab: one line climbs steadily, the other barely moves."
   },
   {
    "t": "term",
    "term": "logarithm",
    "plain": "How many times you can halve something before you reach 1.",
    "like": "Folding a paper in half again and again"
   },
   {
    "t": "quiz",
    "q": "About how many checks does binary search need for 1,000,000 sorted names?",
    "choices": [
     "20",
     "1,000",
     "500,000"
    ],
    "answer": 0,
    "why": "2²⁰ is about a million, so halving 20 times gets you down to one name."
   },
   {
    "t": "try",
    "items": [
     "Measure both",
     "Search for a name that is missing",
     "Step through binary_search"
    ]
   },
   {
    "t": "next",
    "items": [
     "How do databases find rows so fast?",
     "What is a hash map?",
     "Why must binary search have sorted input?"
    ]
   }
  ],
  "growth": {
   "setup": "def make_input(n):\n    return list(range(n))",
   "calls": [
    {
     "label": "linear_search",
     "call": "linear_search(make_input(n), n - 1)"
    },
    {
     "label": "binary_search",
     "call": "binary_search(make_input(n), n - 1)"
    }
   ],
   "label": "Searching for the last item"
  }
 },
 {
  "id": "race-fib",
  "q": "Why is recursive Fibonacci so slow?",
  "lang": "python",
  "title": "Fibonacci race: asking again vs remembering",
  "kicker": "algorithm race",
  "concepts": [
   "recursion",
   "big-o",
   "hash-maps"
  ],
  "file": "fib_race.py",
  "code": "def fib_recursive(n):\n    if n < 2:\n        return n\n    return fib_recursive(n - 1) + fib_recursive(n - 2)\n\nmemo = {}\ndef fib_memo(n):\n    if n < 2:\n        return n\n    if n not in memo:\n        memo[n] = fib_memo(n - 1) + fib_memo(n - 2)\n    return memo[n]\n\ndef fib_loop(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nshow([fib_loop(i) for i in range(12)], \"the first 12\")",
  "pseudo": [
   "Fibonacci, the direct way",
   "The first two numbers are 0 and 1",
   "so return them as they are",
   "Otherwise add the two before (asking again each time)",
   "",
   "A notebook of answers we already know",
   "Fibonacci, remembering answers",
   "The first two are 0 and 1",
   "return them",
   "Not worked out yet?",
   "Work it out once and write it down",
   "Read the answer from the notebook",
   "",
   "Fibonacci, counting up",
   "Start with the first two",
   "Step forward n times",
   "Slide the window one step",
   "That is the answer",
   "",
   "Draw the first 12 numbers"
  ],
  "notes": [
   {
    "from": 4,
    "to": 4,
    "label": "the explosion",
    "text": "Each call makes two more calls, which make two more… fib(30) makes over a million calls."
   },
   {
    "from": 10,
    "to": 11,
    "label": "memoization",
    "text": "Each answer is worked out once, then just read back."
   }
  ],
  "story": [
   {
    "t": "p",
    "md": "Every Fibonacci number is the sum of the two before it: 0, 1, 1, 2, 3, 5, 8… [[1-4|The direct version]] is a perfect copy of that sentence, and it is shockingly slow, because it re-asks the same questions millions of times."
   },
   {
    "t": "p",
    "md": "[[6-12|Remembering answers]] in a dictionary fixes it. So does [[14-18|counting up from the start]]. Press **Step** on a small number to watch the recursive calls pile up, then **Measure** to see the race."
   },
   {
    "t": "term",
    "term": "memoization",
    "plain": "Saving the answer to a question so you never have to work it out twice.",
    "like": "Writing a phone number down instead of looking it up every time"
   },
   {
    "t": "quiz",
    "q": "Roughly how many calls does fib_recursive(n+1) make compared to fib_recursive(n)?",
    "choices": [
     "One more",
     "About 1.6 times as many",
     "Twice as many"
    ],
    "answer": 1,
    "why": "The number of calls grows like Fibonacci itself, by the golden ratio ≈ 1.6 each step."
   },
   {
    "t": "try",
    "items": [
     "Measure all three",
     "Change 12 to 30",
     "Step through fib_recursive(5)"
    ]
   },
   {
    "t": "next",
    "items": [
     "What is dynamic programming?",
     "When is recursion a good idea?",
     "How does a call stack work?"
    ]
   }
  ],
  "growth": {
   "setup": "def make_input(n):\n    return n",
   "calls": [
    {
     "label": "fib_recursive",
     "call": "fib_recursive(n // 4 + 2)"
    },
    {
     "label": "fib_memo",
     "call": "(memo.clear(), fib_memo(n // 4 + 2))"
    },
    {
     "label": "fib_loop",
     "call": "fib_loop(n // 4 + 2)"
    }
   ],
   "label": "Fibonacci number n/4 + 2 (so the slow one finishes)"
  }
 },
 {
  "id": "race-count",
  "q": "Why are dictionaries so fast?",
  "lang": "python",
  "title": "Counting race: searching a list vs a dictionary",
  "kicker": "algorithm race",
  "concepts": [
   "hash-maps",
   "big-o",
   "loops"
  ],
  "file": "count_race.py",
  "code": "words = \"the cat and the hat and the bat\".split()\n\ndef count_with_list(words):\n    counts = []\n    for w in words:\n        for pair in counts:\n            if pair[0] == w:\n                pair[1] += 1\n                break\n        else:\n            counts.append([w, 1])\n    return counts\n\ndef count_with_dict(words):\n    counts = {}\n    for w in words:\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n\nshow(count_with_dict(words), \"word counts\")",
  "pseudo": [
   "Some words to count",
   "",
   "Counting the slow way",
   "A list of (word, count) pairs",
   "For each word…",
   "…search the whole list for it",
   "Found it?",
   "Add one",
   "Stop searching",
   "Searched everything and not found?",
   "Start a new count",
   "Hand back the pairs",
   "",
   "Counting with a dictionary",
   "An empty dictionary",
   "For each word…",
   "…jump straight to its count and add one",
   "Hand back the counts",
   "",
   "Draw the counts as a table"
  ],
  "notes": [
   {
    "from": 6,
    "to": 7,
    "label": "hidden loop",
    "text": "Searching the list is a loop inside the loop: the more distinct words, the slower it gets."
   },
   {
    "from": 17,
    "to": 17,
    "label": "one jump",
    "text": "A dictionary hashes the word to find its slot directly, no searching."
   }
  ],
  "story": [
   {
    "t": "p",
    "md": "Counting how often each word appears: the core of search engines, spam filters and word clouds. [[3-12|The list version]] has to search through every word it has seen so far. [[14-18|The dictionary version]] jumps straight to the right count."
   },
   {
    "t": "term",
    "term": "hash map",
    "plain": "A table that turns a key into a position, so finding it takes one step instead of a search.",
    "like": "A coat check: your ticket number tells them exactly which hook"
   },
   {
    "t": "p",
    "md": "Press **Measure**: with lots of different words the list version grows like **n²**, the dictionary like **n**."
   },
   {
    "t": "quiz",
    "q": "Why is counts.get(w, 0) used instead of counts[w]?",
    "choices": [
     "It is faster",
     "It gives 0 for words not seen yet instead of crashing",
     "It sorts the words"
    ],
    "answer": 1,
    "why": "counts[w] raises a KeyError the first time a word appears; .get returns the default 0."
   },
   {
    "t": "try",
    "items": [
     "Measure both",
     "Add more words to the sentence",
     "Step through count_with_list"
    ]
   },
   {
    "t": "next",
    "items": [
     "How does a hash function work?",
     "What is Python’s Counter?",
     "How does a Bloom filter save memory?"
    ]
   }
  ],
  "growth": {
   "setup": "def make_input(n):\n    return [f\"w{i}\" for i in range(n)]",
   "calls": [
    {
     "label": "count_with_list",
     "call": "count_with_list(make_input(n))"
    },
    {
     "label": "count_with_dict",
     "call": "count_with_dict(make_input(n))"
    }
   ],
   "label": "Every word different (worst case for the list)"
  }
 },
 {
  "id": "race-twosum",
  "q": "Two-sum: nested loops vs a Map",
  "lang": "javascript",
  "title": "Two-sum race: every pair vs a notebook",
  "kicker": "algorithm race",
  "concepts": [
   "hash-maps",
   "big-o",
   "loops"
  ],
  "file": "two_sum.js",
  "code": "function twoSumSlow(nums, target) {\n  for (let i = 0; i < nums.length; i++) {\n    for (let j = i + 1; j < nums.length; j++) {\n      if (nums[i] + nums[j] === target) return [i, j];\n    }\n  }\n  return null;\n}\n\nfunction twoSumFast(nums, target) {\n  const seen = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const need = target - nums[i];\n    if (seen.has(need)) return [seen.get(need), i];\n    seen.set(nums[i], i);\n  }\n  return null;\n}\n\nconst prices = [40, 15, 70, 25, 60];\nconsole.log(twoSumFast(prices, 85));",
  "pseudo": [
   "Two-sum, trying every pair",
   "Pick a first number",
   "Try every number after it",
   "Do they add up? Done",
   "",
   "",
   "No pair adds up",
   "",
   "",
   "Two-sum, remembering what we've seen",
   "A notebook: number → where we saw it",
   "Walk through once",
   "What partner would this number need?",
   "Seen that partner already? Done",
   "Otherwise, note this number",
   "",
   "No pair adds up",
   "",
   "",
   "Some gift prices",
   "Which two gifts cost exactly 85?"
  ],
  "notes": [
   {
    "from": 2,
    "to": 4,
    "label": "every pair",
    "text": "Loops inside loops: 1,000 prices means about half a million pairs."
   },
   {
    "from": 13,
    "to": 14,
    "label": "the trick",
    "text": "Instead of searching for a partner, ask the Map if we already met it: one step."
   }
  ],
  "story": [
   {
    "t": "p",
    "md": "A classic interview puzzle with a real use: find two items whose prices add up to a budget. [[1-8|The obvious way]] tries every pair. [[10-18|The clever way]] walks the list once and keeps a **Map** of what it has seen."
   },
   {
    "t": "term",
    "term": "Map",
    "plain": "A JavaScript object that stores key → value pairs and finds a key in one step.",
    "like": "A contacts app: type a name, get the number instantly"
   },
   {
    "t": "p",
    "md": "Open **Growth** and press **Measure**: pairs grow like **n²**, the notebook like **n**. This trade (a little memory for a lot of speed) is behind caches, indexes and most fast apps."
   },
   {
    "t": "quiz",
    "q": "What does twoSumFast trade to get its speed?",
    "choices": [
     "Accuracy",
     "Memory for the Map",
     "It only works on sorted lists"
    ],
    "answer": 1,
    "why": "It stores up to n numbers in the Map: more memory, far fewer steps."
   },
   {
    "t": "try",
    "items": [
     "Measure both",
     "Change 85 to 1000",
     "Step through twoSumFast"
    ]
   },
   {
    "t": "next",
    "items": [
     "How do hash maps work inside?",
     "What is a time–space trade-off?",
     "How do databases use indexes?"
    ]
   }
  ],
  "growth": {
   "setup": "function makeInput(n) { return Array.from({ length: n }, (_, i) => i * 2); }",
   "calls": [
    {
     "label": "twoSumSlow",
     "call": "twoSumSlow(makeInput(n), -1)"
    },
    {
     "label": "twoSumFast",
     "call": "twoSumFast(makeInput(n), -1)"
    }
   ],
   "label": "No pair adds up (worst case)"
  }
 }
];
