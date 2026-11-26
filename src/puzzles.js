// Puzzles: LeetCode-style problems, taught top-down. Every puzzle opens with code that already works
// (or a gentle stub), then earns three stars: it works, it survives hidden edge cases ("gremlins"),
// and it scales. Problem statements are written fresh; LeetCode numbers are only for reference.
// Code lines carry their plain-English reading after `#>`, so Plain words works with no AI.
// scripts/check-puzzles.mjs runs every puzzle in real Python: tests, gremlins and the speed claims.
const py = String.raw;

export const STATIONS = [
  {
    id: 'start',
    name: 'The shape of every puzzle',
    motto: 'Something goes in, an answer comes out',
    like: 'A vending machine: coin in, snack out. Your function is the machine.',
    art: 'shape',
    term: {
      term: 'test case',
      plain: 'an input together with the answer it should give, used to check your code',
      like: 'the answer key at the back of a workbook',
    },
  },
  {
    id: 'hash',
    name: 'Hash maps',
    motto: 'Remember what you’ve seen',
    like: 'A coat check: hand over your ticket and get your coat back instantly, however many coats there are.',
    art: 'hash',
    term: {
      term: 'hash map',
      plain:
        'a lookup table that finds any item by its key in one step, no matter how many items it holds',
      like: 'a coat check with numbered tickets',
    },
  },
  {
    id: 'pointers',
    name: 'Two pointers',
    motto: 'Two fingers walking',
    like: 'Two friends reading a word from opposite ends, meeting in the middle.',
    art: 'pointers',
    term: {
      term: 'two pointers',
      plain:
        'two positions that move through a list, often from both ends towards the middle, so each item is looked at once',
      like: 'two fingers walking towards each other along a row of books',
    },
  },
  {
    id: 'window',
    name: 'Sliding window',
    motto: 'Update, don’t recount',
    like: 'A train window: one tree leaves on the left as another arrives on the right.',
    art: 'window',
    term: {
      term: 'sliding window',
      plain:
        'a stretch of the list that moves one step at a time; you update its total instead of adding it all up again',
      like: 'the view from a train window',
    },
  },
  {
    id: 'stack',
    name: 'Stacks',
    motto: 'Last in, first out',
    like: 'A pile of plates: you only ever touch the top one.',
    art: 'stack',
    term: {
      term: 'stack',
      plain:
        'a list where you only add or remove at the top, so the last thing in is the first thing out',
      like: 'a pile of plates',
    },
  },
  {
    id: 'binary',
    name: 'Binary search',
    motto: 'Throw away half',
    like: 'Guess my number from 1 to 100. “Higher!” “Lower!” Seven guesses are always enough.',
    art: 'binary',
    term: {
      term: 'binary search',
      plain:
        'finding something in a sorted list by checking the middle and throwing away the half it can’t be in',
      like: 'the higher-or-lower guessing game',
    },
  },
  {
    id: 'heap',
    name: 'Heaps',
    motto: 'Always know the biggest',
    like: 'A hospital waiting room: the most urgent patient is always seen next.',
    art: 'heap',
    term: {
      term: 'heap',
      plain:
        'a structure that always knows its smallest (or biggest) item, and lets you add or remove items quickly',
      like: 'a waiting room ordered by urgency',
    },
  },
  {
    id: 'tree',
    name: 'Trees & recursion',
    motto: 'Solve the small one first',
    like: 'Russian dolls: open one, and inside is a smaller doll of the same kind.',
    art: 'tree',
    term: {
      term: 'recursion',
      plain:
        'a function that solves a problem by calling itself on smaller pieces of the same problem',
      like: 'Russian dolls',
    },
  },
  {
    id: 'graph',
    name: 'Graphs & grids',
    motto: 'Spread out in rings',
    like: 'Drop a stone in a pond: the ripple reaches everything one step away, then two steps…',
    art: 'graph',
    term: {
      term: 'breadth-first search',
      plain:
        'exploring a map in rings: everything one step away, then two steps away, and so on, using a queue',
      like: 'ripples in a pond',
    },
  },
  {
    id: 'dp',
    name: 'Dynamic programming',
    motto: 'Write the answer down',
    like: 'A sticky note for every sum you’ve worked out, so you never work it out twice.',
    art: 'dp',
    term: {
      term: 'dynamic programming',
      plain:
        'solving a big problem by solving small versions first and writing their answers down, so nothing is worked out twice',
      like: 'sticky notes with answers on them',
    },
  },
  {
    id: 'backtrack',
    name: 'Backtracking',
    motto: 'Try, undo, try again',
    like: 'A maze: walk until you hit a dead end, step back, try the next turn.',
    art: 'backtrack',
    term: {
      term: 'backtracking',
      plain: 'trying a choice, exploring where it leads, then undoing it to try the next one',
      like: 'stepping back at dead ends in a maze',
    },
  },
  {
    id: 'intervals',
    name: 'Sort, then sweep',
    motto: 'Put things in order first',
    like: 'Tidying a messy calendar by laying the meetings out from morning to night.',
    art: 'intervals',
    term: {
      term: 'sweep line',
      plain: 'sorting things by where they start, then walking through them once, in order',
      like: 'reading a calendar from morning to night',
    },
  },
  {
    id: 'design',
    name: 'Design a tiny system',
    motto: 'Pick the right container',
    like: 'The books on your desk vs. the library: keep what you use close at hand.',
    art: 'design',
    term: {
      term: 'cache',
      plain: 'a small, fast store that keeps recently used things close at hand',
      like: 'the pile of books on your desk',
    },
  },
];

export const TIERS = { warm: ['🌱', 'warm-up'], classic: ['🧩', 'classic'], boss: ['🔥', 'boss'] };

// Shared tree helpers (LeetCode sends trees as level-order lists like [3, 9, 20, None, None, 15, 7])
const TREE = py`
class Node:                                        #> one spot in the tree
    def __init__(self, val, left=None, right=None):  #> it holds a value and up to two children
        self.val, self.left, self.right = val, left, right  #> remember all three

def build(values):                                 #> turn LeetCode's list into a real tree
    if not values or values[0] is None:            #> an empty list…
        return None                                #> …is an empty tree
    root = Node(values[0])                         #> the first value is the top
    queue, i = [root], 1                           #> nodes waiting for children, next value to use
    while queue and i < len(values):               #> while there are values left
        node = queue.pop(0)                        #> the next node that needs children
        for side in ("left", "right"):             #> its left child, then its right child
            if i < len(values) and values[i] is not None:  #> a real value (not a gap)?
                child = Node(values[i])            #> make the child
                setattr(node, side, child)         #> attach it
                queue.append(child)                #> it will need children too
            i += 1                                 #> move on to the next value
    return root                                    #> the finished tree`;
const TREE_INPUT = py`
def make_input(n):
    nodes = [Node(i) for i in range(n)]
    for i in range(n):
        if 2 * i + 1 < n: nodes[i].left = nodes[2 * i + 1]
        if 2 * i + 2 < n: nodes[i].right = nodes[2 * i + 2]
    return nodes[0]`;

export const PUZZLES = [
  // ───────────────────────────── the shape of every puzzle
  {
    id: 'fizzbuzz',
    st: 'start',
    tier: 'warm',
    title: 'FizzBuzz',
    lc: [412, 'fizz-buzz'],
    hook: 'Count to n, but say Fizz, Buzz or FizzBuzz on the right numbers.',
    md: 'Count from 1 to `n`. For multiples of 3 say **"Fizz"**, for multiples of 5 say **"Buzz"**, for multiples of both say **"FizzBuzz"**, and otherwise say the number. Return all the answers as a list of text.',
    fun: 'FizzBuzz is the most famous first interview question in the world. It isn’t hard; it checks that you can turn a rule into code.',
    fn: 'fizz_buzz',
    startWorks: false,
    start: py`
def fizz_buzz(n):                   #> take a number n
    answers = []                    #> start an empty list of answers
    for i in range(1, n + 1):       #> count from 1 up to n
        answers.append(str(i))      #> for now, just say the number
    return answers                  #> hand back the list`,
    fast: py`
def fizz_buzz(n):                   #> take a number n
    answers = []                    #> start an empty list of answers
    for i in range(1, n + 1):       #> count from 1 up to n
        if i % 15 == 0:             #> a multiple of both 3 and 5?
            answers.append("FizzBuzz")  #> say FizzBuzz
        elif i % 3 == 0:            #> a multiple of 3?
            answers.append("Fizz")  #> say Fizz
        elif i % 5 == 0:            #> a multiple of 5?
            answers.append("Buzz")  #> say Buzz
        else:                       #> none of those
            answers.append(str(i))  #> say the number
    return answers                  #> hand back the list`,
    demo: py`
print(fizz_buzz(15))                #> try it up to 15`,
    tests: [
      [[3], ['1', '2', 'Fizz']],
      [[5], ['1', '2', 'Fizz', '4', 'Buzz']],
      [
        [15],
        [
          '1',
          '2',
          'Fizz',
          '4',
          'Buzz',
          'Fizz',
          '7',
          '8',
          'Fizz',
          'Buzz',
          '11',
          'Fizz',
          '13',
          '14',
          'FizzBuzz',
        ],
      ],
    ],
    gremlins: [
      ['n is 1', [1], ['1']],
      ['n is 0 (nothing to count)', [0], []],
      ['n is 6', [6], ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz']],
    ],
    setup: py`
def make_input(n):
    return n`,
    call: 'fizz_buzz(make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      '`i % 3 == 0` is True when `i` divides by 3 with nothing left over. That’s how you spot a multiple.',
      'Check for 15 **first**. If you check 3 first, 15 says "Fizz" and never reaches "FizzBuzz".',
      'Inside the loop: `if i % 15 == 0` → "FizzBuzz", `elif i % 3 == 0` → "Fizz", `elif i % 5 == 0` → "Buzz", `else` → `str(i)`.',
    ],
    scale: {
      text: 'At a billion, the list of answers alone needs tens of gigabytes. Real systems don’t build the whole list: they hand out answers one at a time as they’re needed (a *generator*, `yield` in Python).',
    },
  },
  {
    id: 'biggest',
    st: 'start',
    tier: 'warm',
    title: 'Find the biggest',
    lc: null,
    hook: 'Find the biggest number in a list, without max().',
    md: 'Return the biggest number in `nums` (it has at least one number). The code in the editor already works. It checks every number against every other number. Make it look at each number only **once**.',
    fn: 'biggest',
    startWorks: true,
    start: py`
def biggest(nums):                  #> take a list of numbers
    for a in nums:                  #> try each number as the answer
        beaten = False              #> assume nobody beats it
        for b in nums:              #> compare it with every number
            if b > a:               #> is someone bigger?
                beaten = True       #> then it isn't the biggest
        if not beaten:              #> nobody was bigger
            return a                #> so this is the biggest`,
    fast: py`
def biggest(nums):                  #> take a list of numbers
    best = nums[0]                  #> the champion so far: the first number
    for x in nums:                  #> look at each number once
        if x > best:                #> does it beat the champion?
            best = x                #> it's the new champion
    return best                     #> the last champion standing`,
    demo: py`
nums = [3, 41, 7, 19, 2]            #> some numbers
show(nums, "nums")                  #> draw them as bars
print(biggest(nums))                #> print the biggest`,
    tests: [
      [[[3, 41, 7, 19, 2]], 41],
      [[[5]], 5],
      [[[1, 2, 3, 4]], 4],
      [[[9, 1, 9]], 9],
    ],
    gremlins: [
      ['all negative', [[-5, -2, -9]], -2],
      ['all the same', [[4, 4, 4]], 4],
      ['huge numbers', [[10 ** 12, 3, 10 ** 15]], 10 ** 15],
    ],
    setup: py`
def make_input(n):
    return list(range(n))`,
    call: 'biggest(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'Imagine reading the list out loud. You only need to remember one number as you go.',
      'Keep a “champion so far”. Start with the first number.',
      '`best = nums[0]`, then for each `x`, if `x > best`, set `best = x`. Return `best`.',
    ],
    scale: {
      text: 'With a billion numbers spread over 1,000 computers, each computer finds its own biggest, then you compare just the 1,000 winners. That split-then-combine trick is how Google’s MapReduce works.',
      idea: 'mapreduce',
    },
  },

  // ───────────────────────────── hash maps
  {
    id: 'dupes',
    st: 'hash',
    tier: 'warm',
    title: 'Contains duplicate',
    lc: [217, 'contains-duplicate'],
    hook: 'Does any number appear twice?',
    md: 'Return `True` if any number appears more than once in `nums`, otherwise `False`.',
    fn: 'has_duplicate',
    startWorks: true,
    start: py`
def has_duplicate(nums):                    #> take a list of numbers
    for i in range(len(nums)):              #> pick each position i
        for j in range(i + 1, len(nums)):   #> compare it with every later position j
            if nums[i] == nums[j]:          #> the same number twice?
                return True                 #> found a duplicate
    return False                            #> checked every pair: no duplicates`,
    fast: py`
def has_duplicate(nums):                    #> take a list of numbers
    seen = set()                            #> numbers we've already met
    for x in nums:                          #> look at each number once
        if x in seen:                       #> met it before? (one step, thanks to hashing)
            return True                     #> found a duplicate
        seen.add(x)                         #> remember it
    return False                            #> never met anything twice`,
    demo: py`
nums = [4, 1, 9, 1]                         #> 1 appears twice
show(nums, "nums")                          #> draw the list
print(has_duplicate(nums))                  #> True`,
    tests: [
      [[[4, 1, 9, 1]], true],
      [[[1, 2, 3, 4]], false],
      [[[7, 7]], true],
      [[[3, 1, 4, 1, 5, 9]], true],
    ],
    gremlins: [
      ['an empty list', [[]], false],
      ['just one number', [[7]], false],
      ['negative twins', [[-1, 5, -1]], true],
    ],
    setup: py`
def make_input(n):
    return list(range(n))`,
    call: 'has_duplicate(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'As you walk through the list, you need to remember every number you’ve already seen.',
      'Careful: `x in a_list` secretly checks every item, one by one. `x in a_set` jumps straight to the answer.',
      'Make `seen = set()`. For each `x`: if `x in seen`, return True; otherwise `seen.add(x)`.',
    ],
    scale: {
      text: 'Chrome checks every address you visit against millions of known dangerous sites. A set that big won’t fit on your phone, so Chrome uses a **Bloom filter**: a tiny set that’s allowed to be very slightly wrong.',
      idea: 'bloom',
      real: { label: 'Redis’s hash table', repo: 'redis/redis', file: 'src/dict.c' },
    },
  },
  {
    id: 'twosum',
    st: 'hash',
    tier: 'classic',
    title: 'Two Sum',
    lc: [1, 'two-sum'],
    hook: 'Find the two numbers that add up to a target.',
    md: 'Return the positions of the two numbers in `nums` that add up to `target`, smaller position first. There is always exactly one answer, and you can’t use the same position twice.',
    fun: 'LeetCode problem #1, and probably the most-solved interview puzzle ever.',
    fn: 'two_sum',
    startWorks: true,
    start: py`
def two_sum(nums, target):                  #> take the numbers and the target
    for i in range(len(nums)):              #> pick a first number
        for j in range(i + 1, len(nums)):   #> try every number after it
            if nums[i] + nums[j] == target: #> do they add up?
                return [i, j]               #> hand back both positions`,
    fast: py`
def two_sum(nums, target):                  #> take the numbers and the target
    where = {}                              #> number → the position we saw it at
    for i, x in enumerate(nums):            #> look at each number once, with its position
        need = target - x                   #> the partner this number needs
        if need in where:                   #> have we already seen that partner?
            return [where[need], i]         #> yes: the partner's position, then ours
        where[x] = i                        #> remember where this number lives`,
    demo: py`
nums = [2, 7, 11, 15]                       #> the numbers
show(nums, "nums")                          #> draw them
print(two_sum(nums, 9))                     #> 2 + 7 = 9, so [0, 1]`,
    tests: [
      [
        [[2, 7, 11, 15], 9],
        [0, 1],
      ],
      [
        [[3, 2, 4], 6],
        [1, 2],
      ],
      [
        [[3, 3], 6],
        [0, 1],
      ],
      [
        [[1, 5, 8, 3], 11],
        [2, 3],
      ],
    ],
    gremlins: [
      ['negative numbers', [[-3, 4, 3, 90], 0], [0, 2]],
      ['zeros', [[0, 4, 3, 0], 0], [0, 3]],
      ['huge numbers', [[1, 2, 1000000000, 999999999], 1999999999], [2, 3]],
    ],
    setup: py`
def make_input(n):
    return list(range(n)), (n - 2) + (n - 1)`,
    call: 'two_sum(*make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      'For each number `x`, you know exactly which partner it needs: `target - x`.',
      'Instead of searching for the partner every time, *remember* every number you’ve passed in a dictionary: number → position.',
      'For each `i, x`: `need = target - x`. If `need in where`, return `[where[need], i]`. Otherwise store `where[x] = i`.',
    ],
    scale: {
      text: 'When one dictionary can’t hold everything, companies split it across many machines by hashing the key. Discord uses a *hash ring* so that adding a machine only moves a few keys.',
      idea: 'ring',
      real: { label: 'Redis’s hash table', repo: 'redis/redis', file: 'src/dict.c' },
    },
  },
  {
    id: 'anagrams',
    st: 'hash',
    tier: 'boss',
    title: 'Group anagrams',
    lc: [49, 'group-anagrams'],
    hook: 'Group words made of the same letters, like eat, tea and ate.',
    md: 'Put words that use exactly the same letters into the same group (*eat*, *tea* and *ate* are one group). Return the groups, in any order.',
    fn: 'check',
    startWorks: true,
    start: py`
def same_letters(a, b):                     #> do two words use the same letters?
    return sorted(a) == sorted(b)           #> sort both sets of letters and compare

def group_anagrams(words):                  #> take a list of words
    groups = []                             #> no groups yet
    for w in words:                         #> for each word
        for g in groups:                    #> look through every group so far
            if same_letters(g[0], w):       #> does it belong here?
                g.append(w)                 #> join this group
                break                       #> stop looking
        else:                               #> no group matched
            groups.append([w])              #> start a new group
    return groups                           #> hand back the groups`,
    fast: py`
def group_anagrams(words):                  #> take a list of words
    groups = {}                             #> sorted letters → the words with those letters
    for w in words:                         #> look at each word once
        key = "".join(sorted(w))            #> its letters in order: "tea" → "aet"
        groups.setdefault(key, []).append(w)  #> put it in that group (making it if needed)
    return list(groups.values())            #> just the groups`,
    helpers: py`
def check(words):                           #> how the tests read your answer
    return sorted(sorted(g) for g in group_anagrams(words))  #> sort so that order doesn't matter`,
    demo: py`
print(group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"]))  #> three groups`,
    tests: [
      [
        [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']],
        [['ate', 'eat', 'tea'], ['bat'], ['nat', 'tan']],
      ],
      [[['']], [['']]],
      [[['a']], [['a']]],
    ],
    gremlins: [
      ['no words at all', [[]], []],
      ['different lengths', [['ab', 'ba', 'abc']], [['ab', 'ba'], ['abc']]],
      ['a word twice', [['abc', 'cab', 'abc', 'xyz']], [['abc', 'abc', 'cab'], ['xyz']]],
    ],
    setup: py`
def make_input(n):
    return ["".join(chr(0x4E00 + 1000 * p + (i // 1000 ** p) % 1000) for p in range(3)) for i in range(n)]`,
    call: 'group_anagrams(make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      'Every word in a group has something in common you can compute: its letters in alphabetical order.',
      'Use that sorted-letters text as a **key** in a dictionary, and each value is a list of words.',
      '`key = "".join(sorted(w))`, then `groups.setdefault(key, []).append(w)`. Return `list(groups.values())`.',
    ],
    scale: {
      text: 'This is MapReduce in miniature: compute a key for every item (map), then gather items with the same key (reduce). Google ran this exact shape over the whole web.',
      idea: 'mapreduce',
    },
  },

  // ───────────────────────────── two pointers
  {
    id: 'reverse',
    st: 'pointers',
    tier: 'warm',
    title: 'Reverse in place',
    lc: [344, 'reverse-string'],
    hook: 'Reverse a list of letters without making a second list.',
    md: 'Reverse the list `chars` **in place**: change the list you were given rather than building a new one, then return it.',
    fn: 'reverse',
    startWorks: true,
    start: py`
def reverse(chars):                 #> take a list of letters
    out = []                        #> start a new, empty list
    for c in chars:                 #> for each letter, left to right
        out.insert(0, c)            #> squeeze it in at the very front (everything shuffles along!)
    chars[:] = out                  #> copy the result back into the original list
    return chars                    #> hand it back`,
    fast: py`
def reverse(chars):                 #> take a list of letters
    i, j = 0, len(chars) - 1        #> one finger at each end
    while i < j:                    #> until the fingers meet
        chars[i], chars[j] = chars[j], chars[i]  #> swap the two letters
        i += 1                      #> left finger steps right
        j -= 1                      #> right finger steps left
    return chars                    #> the same list, reversed`,
    demo: py`
word = list("hello")                #> the letters of hello
show(word, "before")                #> draw them
show(reverse(word), "after")        #> and reversed`,
    tests: [
      [[['h', 'e', 'l', 'l', 'o']], ['o', 'l', 'l', 'e', 'h']],
      [[['H', 'a', 'n', 'n', 'a', 'h']], ['h', 'a', 'n', 'n', 'a', 'H']],
      [[['a', 'b']], ['b', 'a']],
    ],
    gremlins: [
      ['an empty list', [[]], []],
      ['one letter', [['a']], ['a']],
      ['odd length', [['x', 'y', 'z']], ['z', 'y', 'x']],
    ],
    setup: py`
def make_input(n):
    return list(range(n))`,
    call: 'reverse(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      '`insert(0, c)` looks like one step, but Python has to shuffle every letter along to make room. That’s a hidden loop.',
      'Put one finger on the first letter and one on the last. Swap them, then move both fingers inwards.',
      '`i, j = 0, len(chars) - 1`. While `i < j`: swap `chars[i]` and `chars[j]`, then `i += 1` and `j -= 1`.',
    ],
    scale: {
      text: 'In place also means no second copy. When a file is 10 GB, you often can’t afford another 10 GB, so databases and video editors rearrange data where it already sits.',
    },
  },
  {
    id: 'sortedpair',
    st: 'pointers',
    tier: 'classic',
    title: 'Two Sum, sorted',
    lc: [167, 'two-sum-ii-input-array-is-sorted'],
    hook: 'The list is sorted: find the pair that adds up to the target.',
    md: 'Same as Two Sum, but the numbers are **sorted** from small to big. Return the two positions (counting from 0) whose numbers add up to `target`. Use the order to avoid checking every pair. (LeetCode counts positions from 1 in this one.)',
    fn: 'pair_sum_sorted',
    startWorks: true,
    start: py`
def pair_sum_sorted(nums, target):          #> take sorted numbers and a target
    for i in range(len(nums)):              #> pick a first number
        for j in range(i + 1, len(nums)):   #> try every number after it
            if nums[i] + nums[j] == target: #> do they add up?
                return [i, j]               #> hand back both positions`,
    fast: py`
def pair_sum_sorted(nums, target):          #> take sorted numbers and a target
    i, j = 0, len(nums) - 1                 #> smallest number on the left, biggest on the right
    while i < j:                            #> until the fingers meet
        s = nums[i] + nums[j]               #> add the two
        if s == target:                     #> exactly right?
            return [i, j]                   #> found the pair
        if s < target:                      #> too small?
            i += 1                          #> try a bigger left number
        else:                               #> too big
            j -= 1                          #> try a smaller right number`,
    demo: py`
nums = [1, 3, 4, 5, 7, 11]                  #> sorted numbers
show(nums, "nums")                          #> draw them
print(pair_sum_sorted(nums, 9))             #> 4 + 5 = 9, so [2, 3]`,
    tests: [
      [
        [[2, 7, 11, 15], 9],
        [0, 1],
      ],
      [
        [[2, 3, 4], 6],
        [0, 2],
      ],
      [
        [[-1, 0], -1],
        [0, 1],
      ],
      [
        [[1, 3, 4, 5, 7, 11], 9],
        [2, 3],
      ],
    ],
    gremlins: [
      ['repeated numbers', [[1, 1, 1, 1, 9], 10], [0, 4]],
      ['negatives', [[-5, -3, 0, 4, 8], 5], [1, 4]],
      ['zeros', [[0, 0, 3, 4], 0], [0, 1]],
    ],
    setup: py`
def make_input(n):
    return list(range(n)), (n - 2) + (n - 1)`,
    call: 'pair_sum_sorted(*make_input(n))',
    target: 'O(n)',
    big: 30000,
    hints: [
      'Look at the smallest and the biggest number together. If their sum is too big, can the biggest number ever be part of the answer?',
      'No! So drop it and move the right finger left. If the sum is too small, move the left finger right.',
      'Start with `i, j = 0, len(nums) - 1`. While `i < j`: if the sum is the target, return; if it’s too small, `i += 1`; else `j -= 1`.',
    ],
    scale: {
      text: 'Google’s LevelDB keeps data in sorted files and merges them by walking two fingers forward through two files at once, never jumping back. That’s how it handles billions of keys on one disk.',
      idea: 'lsm',
      real: {
        label: 'LevelDB’s merging iterator',
        repo: 'google/leveldb',
        file: 'table/merger.cc',
      },
    },
  },
  {
    id: 'water',
    st: 'pointers',
    tier: 'boss',
    title: 'Container with most water',
    lc: [11, 'container-with-most-water'],
    hook: 'Pick two walls that hold the most water between them.',
    md: 'Each number is the height of a wall. Pick two walls: the water between them is **the shorter wall × the distance between them**. Return the most water any two walls can hold.',
    fn: 'most_water',
    startWorks: true,
    start: py`
def most_water(h):                          #> take the wall heights
    best = 0                                #> the most water so far
    for i in range(len(h)):                 #> pick a left wall
        for j in range(i + 1, len(h)):      #> and a right wall
            water = min(h[i], h[j]) * (j - i)  #> shorter wall times the gap
            best = max(best, water)         #> keep the biggest
    return best                             #> the most water`,
    fast: py`
def most_water(h):                          #> take the wall heights
    i, j, best = 0, len(h) - 1, 0           #> the two outermost walls; no water yet
    while i < j:                            #> until the walls meet
        best = max(best, min(h[i], h[j]) * (j - i))  #> water between these two
        if h[i] < h[j]:                     #> the left wall is the short one
            i += 1                          #> only a taller left wall could do better
        else:                               #> the right wall is the short one
            j -= 1                          #> so move the right wall in
    return best                             #> the most water`,
    demo: py`
walls = [1, 8, 6, 2, 5, 4, 8, 3, 7]         #> wall heights
show(walls, "walls")                        #> draw them
print(most_water(walls))                    #> 49: walls 8 and 7, 7 apart`,
    tests: [
      [[[1, 8, 6, 2, 5, 4, 8, 3, 7]], 49],
      [[[1, 1]], 1],
      [[[4, 3, 2, 1, 4]], 16],
      [[[1, 2, 1]], 2],
    ],
    gremlins: [
      ['walls of height 0', [[0, 0]], 0],
      ['all the same height', [[5, 5, 5, 5]], 15],
      ['two tall walls side by side', [[1, 1000, 1000, 1]], 1000],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(1, 10000) for _ in range(n)]`,
    call: 'most_water(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'Start with the two outermost walls: they’re the furthest apart.',
      'The water is limited by the *shorter* wall. Moving the taller wall inwards can never help, because the gap shrinks and the short wall still limits you.',
      'While `i < j`: update `best`, then move the shorter wall inwards (`i += 1` if `h[i] < h[j]`, else `j -= 1`).',
    ],
    scale: {
      text: 'With a billion walls, just *reading* them takes a while. That’s the floor: no method can beat O(n) when every wall might matter. Getting there means you’ve hit the best possible.',
    },
  },

  // ───────────────────────────── sliding window
  {
    id: 'window',
    st: 'window',
    tier: 'warm',
    title: 'Best k in a row',
    lc: [643, 'maximum-average-subarray-i'],
    hook: 'Find the biggest total of k numbers in a row.',
    md: 'Return the biggest total of `k` numbers that sit next to each other in `nums`. (LeetCode asks for the average; it’s the same idea.)',
    fn: 'best_window',
    startWorks: true,
    start: py`
def best_window(nums, k):                   #> take the numbers and the window size k
    best = None                             #> no best yet
    for start in range(len(nums) - k + 1):  #> try every starting position
        total = 0                           #> add up this window from scratch
        for x in nums[start:start + k]:     #> each number inside the window
            total += x                      #> add it
        if best is None or total > best:    #> the best so far?
            best = total                    #> remember it
    return best                             #> the biggest window total`,
    fast: py`
def best_window(nums, k):                   #> take the numbers and the window size k
    total = sum(nums[:k])                   #> add up the first window once
    best = total                            #> it's the best so far
    for i in range(k, len(nums)):           #> slide the window one step right
        total += nums[i] - nums[i - k]      #> one number comes in, one goes out
        best = max(best, total)             #> keep the biggest
    return best                             #> the biggest window total`,
    demo: py`
nums = [1, 12, -5, -6, 50, 3]               #> the numbers
show(nums, "nums")                          #> draw them
print(best_window(nums, 4))                 #> 12 - 5 - 6 + 50 = 51`,
    tests: [
      [[[1, 12, -5, -6, 50, 3], 4], 51],
      [[[5], 1], 5],
      [[[1, 2, 3, 4], 2], 7],
      [[[3, -1, 4, -1, 5], 3], 8],
    ],
    gremlins: [
      ['all negative', [[-3, -1, -2], 2], -3],
      ['window is the whole list', [[2, 4, 6], 3], 12],
      ['zeros', [[0, 0, 0], 1], 0],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(-100, 100) for _ in range(n)], n // 2`,
    call: 'best_window(*make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'Two windows next to each other share almost all their numbers. Why add them all up again?',
      'When the window slides one step right, exactly one number enters and one number leaves.',
      'Add up the first `k` numbers once. Then for each new `i`: `total += nums[i] - nums[i - k]`, and keep the best.',
    ],
    scale: {
      text: '“How many requests did this customer make in the last minute?” is a sliding window. Stripe’s rate limiter answers it millions of times a second by updating running counts, not recounting.',
      idea: 'bucket',
    },
  },
  {
    id: 'stock',
    st: 'window',
    tier: 'classic',
    title: 'Best time to buy and sell',
    lc: [121, 'best-time-to-buy-and-sell-stock'],
    hook: 'Buy one day, sell a later day: the most profit.',
    md: 'You get the price of a stock for each day. Buy on one day and sell on a **later** day. Return the most profit you could make, or `0` if no trade makes money.',
    fn: 'max_profit',
    startWorks: true,
    start: py`
def max_profit(prices):                     #> take the price for each day
    best = 0                                #> no profit yet
    for buy in range(len(prices)):          #> pick a day to buy
        for sell in range(buy + 1, len(prices)):  #> and a later day to sell
            best = max(best, prices[sell] - prices[buy])  #> keep the best profit
    return best                             #> the most you could make`,
    fast: py`
def max_profit(prices):                     #> take the price for each day
    cheapest = float("inf")                 #> the cheapest price so far (none yet)
    best = 0                                #> no profit yet
    for p in prices:                        #> walk through the days once
        cheapest = min(cheapest, p)         #> was today the cheapest day so far?
        best = max(best, p - cheapest)      #> selling today: is that a record profit?
    return best                             #> the most you could make`,
    demo: py`
prices = [7, 1, 5, 3, 6, 4]                 #> a week of prices
show(prices, "prices")                      #> draw them
print(max_profit(prices))                   #> buy at 1, sell at 6: 5`,
    tests: [
      [[[7, 1, 5, 3, 6, 4]], 5],
      [[[7, 6, 4, 3, 1]], 0],
      [[[2, 4, 1]], 2],
      [[[3, 3]], 0],
    ],
    gremlins: [
      ['just one day', [[5]], 0],
      ['no days at all', [[]], 0],
      ['always rising', [[1, 2, 3, 4, 5, 6]], 5],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(1, 10000) for _ in range(n)]`,
    call: 'max_profit(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'If you sell today, which day should you have bought on?',
      'The cheapest day *before* today. So keep track of the cheapest price you’ve seen so far.',
      'One loop: `cheapest = min(cheapest, p)`, then `best = max(best, p - cheapest)`.',
    ],
    scale: {
      text: 'Trading systems watch millions of prices a second. They can’t look back over all of history on every tick, so they keep running numbers (like “cheapest so far”) and update them as each price arrives.',
    },
  },
  {
    id: 'unique',
    st: 'window',
    tier: 'boss',
    title: 'Longest stretch without repeats',
    lc: [3, 'longest-substring-without-repeating-characters'],
    hook: 'The longest piece of text with no letter repeated.',
    md: 'Return the length of the longest stretch of `s` (letters side by side) in which no character appears twice. In `"abcabcbb"` that’s `"abc"`, so `3`.',
    fn: 'longest_unique',
    startWorks: true,
    start: py`
def longest_unique(s):                      #> take some text
    best = 0                                #> the longest stretch so far
    for start in range(len(s)):             #> try every starting letter
        seen = set()                        #> letters in this stretch
        for ch in s[start:]:                #> walk forward from there
            if ch in seen:                  #> a repeat?
                break                       #> this stretch ends here
            seen.add(ch)                    #> remember the letter
        best = max(best, len(seen))         #> keep the longest
    return best                             #> its length`,
    fast: py`
def longest_unique(s):                      #> take some text
    last = {}                               #> letter → where we saw it last
    start = best = 0                        #> the window starts at 0; nothing found yet
    for i, ch in enumerate(s):              #> grow the window one letter at a time
        if ch in last and last[ch] >= start:  #> is this letter already inside the window?
            start = last[ch] + 1            #> jump the start just past its old copy
        last[ch] = i                        #> remember where we saw it
        best = max(best, i - start + 1)     #> is this window a record?
    return best                             #> its length`,
    demo: py`
print(longest_unique("abcabcbb"))           #> "abc" → 3
print(longest_unique("pwwkew"))             #> "wke" → 3`,
    tests: [
      [['abcabcbb'], 3],
      [['bbbbb'], 1],
      [['pwwkew'], 3],
      [[''], 0],
    ],
    gremlins: [
      ['a single space', [' '], 1],
      ['the repeat is in the middle', ['dvdf'], 3],
      ['mirror word', ['abba'], 2],
    ],
    setup: py`
def make_input(n):
    return "".join(chr(0x10000 + i) for i in range(n))`,
    call: 'longest_unique(make_input(n))',
    target: 'O(n)',
    big: 50000,
    hints: [
      'When you hit a repeat, you don’t need to start over from the next letter. Most of what you’ve seen is still fine.',
      'Keep a window. When a letter repeats inside it, move the window’s start to just after the earlier copy of that letter.',
      'Remember `last[ch] = i`. If `ch` was last seen at or after `start`, set `start = last[ch] + 1`. The window length is `i - start + 1`.',
    ],
    scale: {
      text: 'Streams of events (clicks, sensor readings, network packets) are checked for repeats the same way: a window that only remembers what’s inside it, so memory stays small however long the stream runs.',
    },
  },

  // ───────────────────────────── stacks
  {
    id: 'brackets',
    st: 'stack',
    tier: 'classic',
    title: 'Valid brackets',
    lc: [20, 'valid-parentheses'],
    hook: 'Is every bracket closed by the right kind, in the right order?',
    md: 'Return `True` if every bracket in `s` is closed by the same kind of bracket, in the right order. `"([])"` is fine; `"([)]"` is not.',
    fn: 'balanced',
    startWorks: true,
    start: py`
def balanced(s):                            #> take a string of brackets
    while True:                             #> keep crossing out pairs…
        for i in range(len(s) - 1):         #> look along the string, left to right
            if s[i:i + 2] in ("()", "[]", "{}"):  #> a matching pair side by side?
                s = s[:i] + s[i + 2:]       #> cross it out
                break                       #> and start looking again from the beginning
        else:                               #> went all the way along without finding a pair
            return s == ""                  #> balanced if nothing is left`,
    fast: py`
def balanced(s):                            #> take a string of brackets
    pairs = {")": "(", "]": "[", "}": "{"}  #> each closer and the opener it needs
    stack = []                              #> openers still waiting to be closed
    for ch in s:                            #> read the brackets left to right
        if ch in pairs:                     #> a closer?
            if not stack or stack.pop() != pairs[ch]:  #> no opener waiting, or the wrong kind?
                return False                #> not balanced
        else:                               #> an opener
            stack.append(ch)                #> put it on top of the pile
    return not stack                        #> balanced if nothing is left waiting`,
    demo: py`
print(balanced("{[()]}"))                   #> True
print(balanced("([)]"))                     #> False`,
    tests: [
      [['()'], true],
      [['()[]{}'], true],
      [['(]'], false],
      [['([)]'], false],
      [['{[]}'], true],
    ],
    gremlins: [
      ['an empty string', [''], true],
      ['only an opener', ['('], false],
      ['only a closer', [']'], false],
    ],
    setup: py`
def make_input(n):
    return "(" * (n // 2) + ")" * (n // 2)`,
    call: 'balanced(make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      'Deeply nested brackets like `((((()))))` make the obvious way walk halfway along the string for every single pair it crosses out.',
      'The most recent unclosed opener is the one the next closer must match. “Most recent” is a stack.',
      'Push openers. On a closer, pop the top and check it’s the matching opener. At the end, the stack must be empty.',
    ],
    scale: {
      text:
        'Every code editor, compiler and browser does this to check your brackets as you type. Python’s own tokenizer keeps a stack of open brackets; that’s how it can tell you “' +
        "'('" +
        ' was never closed”.',
      real: {
        label: 'Python’s tokenizer (its bracket stack)',
        url: 'https://github.com/python/cpython/blob/main/Parser/lexer/lexer.c',
      },
    },
  },
  {
    id: 'warmer',
    st: 'stack',
    tier: 'boss',
    title: 'Days until warmer',
    lc: [739, 'daily-temperatures'],
    hook: 'For each day, how long until a warmer one?',
    md: 'For each day in `temps`, return how many days you’d wait for a warmer day (`0` if it never comes).',
    fn: 'wait_for_warmer',
    startWorks: true,
    start: py`
def wait_for_warmer(temps):                 #> take a temperature for each day
    answer = []                             #> days to wait, one per day
    for i in range(len(temps)):             #> for each day
        wait = 0                            #> assume no warmer day comes
        for j in range(i + 1, len(temps)):  #> look at the days after it
            if temps[j] > temps[i]:         #> warmer?
                wait = j - i                #> that's how long we'd wait
                break                       #> stop looking
        answer.append(wait)                 #> record it
    return answer                           #> one wait per day`,
    fast: py`
def wait_for_warmer(temps):                 #> take a temperature for each day
    answer = [0] * len(temps)               #> assume nobody gets a warmer day
    waiting = []                            #> days still waiting for a warmer one (a stack)
    for i, t in enumerate(temps):           #> walk through the days once
        while waiting and temps[waiting[-1]] < t:  #> today beats the most recent waiting day?
            j = waiting.pop()               #> that day's wait is over
            answer[j] = i - j               #> it waited this many days
        waiting.append(i)                   #> today starts waiting too
    return answer                           #> one wait per day`,
    demo: py`
temps = [73, 74, 75, 71, 69, 72, 76, 73]    #> a week of temperatures
show(temps, "temps")                        #> draw them
print(wait_for_warmer(temps))               #> [1, 1, 4, 2, 1, 1, 0, 0]`,
    tests: [
      [[[73, 74, 75, 71, 69, 72, 76, 73]], [1, 1, 4, 2, 1, 1, 0, 0]],
      [[[30, 40, 50, 60]], [1, 1, 1, 0]],
      [[[30, 60, 90]], [1, 1, 0]],
    ],
    gremlins: [
      ['just one day', [[50]], [0]],
      ['every day the same', [[70, 70, 70]], [0, 0, 0]],
      ['always colder', [[90, 80, 70]], [0, 0, 0]],
    ],
    setup: py`
def make_input(n):
    return list(range(n, 0, -1))`,
    call: 'wait_for_warmer(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'When it keeps getting colder, every day is still waiting, and the obvious way rescans the whole future for each of them.',
      'Keep the days that are still waiting on a stack. A warm day can finish off several of them at once.',
      'For each day `i`: while the top waiting day is colder than today, pop it and set its answer to `i - j`. Then push `i`.',
    ],
    scale: {
      text: 'This “waiting line on a stack” is called a monotonic stack. Each day goes on the stack once and comes off once, so even 10 years of hourly readings take one quick pass.',
    },
  },

  // ───────────────────────────── binary search
  {
    id: 'search',
    st: 'binary',
    tier: 'warm',
    title: 'Find it in a sorted list',
    lc: [704, 'binary-search'],
    hook: 'Find a number in a sorted list by halving.',
    md: 'The numbers are sorted from small to big. Return the position of `target`, or `-1` if it isn’t there.',
    fn: 'find',
    startWorks: true,
    start: py`
def find(nums, target):                     #> take sorted numbers and a target
    for i in range(len(nums)):              #> look at each position, left to right
        if nums[i] == target:               #> is this the one?
            return i                        #> found it
    return -1                               #> not there`,
    fast: py`
def find(nums, target):                     #> take sorted numbers and a target
    lo, hi = 0, len(nums) - 1               #> it can only be somewhere from lo to hi
    while lo <= hi:                         #> while there's anywhere left to look
        mid = (lo + hi) // 2                #> look in the middle
        if nums[mid] == target:             #> found it?
            return mid                      #> its position
        if nums[mid] < target:              #> the middle is too small?
            lo = mid + 1                    #> throw away the left half
        else:                               #> the middle is too big
            hi = mid - 1                    #> throw away the right half
    return -1                               #> nowhere left: not there`,
    demo: py`
nums = [-1, 0, 3, 5, 9, 12]                 #> sorted numbers
show(nums, "nums")                          #> draw them
print(find(nums, 9))                        #> 4`,
    tests: [
      [[[-1, 0, 3, 5, 9, 12], 9], 4],
      [[[-1, 0, 3, 5, 9, 12], 2], -1],
      [[[5], 5], 0],
      [[[1, 3, 5, 7], 1], 0],
    ],
    gremlins: [
      ['an empty list', [[], 3], -1],
      ['the very last one', [[1, 3, 5, 7], 7], 3],
      ['bigger than everything', [[1, 3, 5, 7], 8], -1],
    ],
    setup: py`
def make_input(n):
    return list(range(n)), n`,
    call: 'find(*make_input(n))',
    target: 'O(log n)',
    big: 1000000,
    hints: [
      'The list is sorted. If the middle number is too small, what do you know about everything to its left?',
      'They’re all too small too! Throw that whole half away and look at the middle of what’s left.',
      'Keep `lo` and `hi`. While `lo <= hi`: check `mid = (lo + hi) // 2`, then move `lo = mid + 1` or `hi = mid - 1`.',
    ],
    scale: {
      text: 'A billion sorted items need only about 30 looks. That’s why databases keep their indexes sorted, and why LevelDB can find one key among billions on a disk.',
      idea: 'lsm',
      real: {
        label: 'Python’s own bisect module',
        url: 'https://github.com/python/cpython/blob/main/Lib/bisect.py',
      },
    },
  },
  {
    id: 'firstbad',
    st: 'binary',
    tier: 'classic',
    title: 'First bad version',
    lc: [278, 'first-bad-version'],
    hook: 'A bug crept in at some version. Find the first broken one.',
    md: 'Your app has versions `0, 1, 2…`. At some point a bug crept in, and every version after it is broken too. `versions[i]` is `True` if version `i` is broken. Return the first broken version. (LeetCode gives you a function to call instead of a list.)',
    fn: 'first_bad',
    startWorks: true,
    start: py`
def first_bad(versions):                    #> take broken (True) / fine (False) for each version
    for i in range(len(versions)):          #> check each version, oldest first
        if versions[i]:                     #> broken?
            return i                        #> the first broken one`,
    fast: py`
def first_bad(versions):                    #> take broken (True) / fine (False) for each version
    lo, hi = 0, len(versions) - 1           #> the first bad one is somewhere in here
    while lo < hi:                          #> until only one version is left
        mid = (lo + hi) // 2                #> test the middle version
        if versions[mid]:                   #> broken?
            hi = mid                        #> the first bad one is here or earlier
        else:                               #> fine
            lo = mid + 1                    #> the first bad one is later
    return lo                               #> the only version left`,
    demo: py`
versions = [False, False, False, True, True]  #> the bug arrived in version 3
show(versions, "broken?")                   #> draw them
print(first_bad(versions))                  #> 3`,
    tests: [
      [[[false, false, true, true]], 2],
      [[[true]], 0],
      [[[false, true]], 1],
      [[[false, false, false, false, true]], 4],
    ],
    gremlins: [
      ['broken from the start', [[true, true, true]], 0],
      [
        'only the newest is broken',
        [[false, false, false, false, false, false, false, false, false, true]],
        9,
      ],
      ['broken at version 1', [[false, true, true, true, true, true, true]], 1],
    ],
    setup: py`
def make_input(n):
    return [False] * (n - 1) + [True]`,
    call: 'first_bad(make_input(n))',
    target: 'O(log n)',
    big: 1000000,
    hints: [
      'Checking a version can be slow in real life (you have to build and test it). How few checks can you get away with?',
      'Test the middle version. If it’s broken, the first bad one is there or earlier. If it’s fine, it’s later.',
      'Keep `lo, hi`. While `lo < hi`: if `versions[mid]` is broken, `hi = mid`, else `lo = mid + 1`. Return `lo`.',
    ],
    scale: {
      text: 'This is exactly `git bisect`: among 10,000 commits it finds the one that broke your app in about 14 tests. Linux kernel developers use it to hunt bugs across years of history.',
      real: { label: 'Git’s bisect', repo: 'git/git', file: 'bisect.c' },
    },
  },
  {
    id: 'rotated',
    st: 'binary',
    tier: 'boss',
    title: 'Smallest in a rotated list',
    lc: [153, 'find-minimum-in-rotated-sorted-array'],
    hook: 'A sorted list was rotated. Find the smallest, fast.',
    md: 'A sorted list was rotated: `[0, 1, 2, 4, 5, 6, 7]` became `[4, 5, 6, 7, 0, 1, 2]`. The numbers are all different. Return the smallest, without looking at every number.',
    fn: 'rotated_min',
    startWorks: true,
    start: py`
def rotated_min(nums):                      #> take the rotated list
    smallest = nums[0]                      #> start with the first number
    for x in nums:                          #> look at every number
        if x < smallest:                    #> smaller?
            smallest = x                    #> remember it
    return smallest                         #> the smallest`,
    fast: py`
def rotated_min(nums):                      #> take the rotated list
    lo, hi = 0, len(nums) - 1               #> the smallest is somewhere in here
    while lo < hi:                          #> until one number is left
        mid = (lo + hi) // 2                #> look in the middle
        if nums[mid] > nums[hi]:            #> middle bigger than the right end?
            lo = mid + 1                    #> the drop (and the smallest) is to the right
        else:                               #> the right part is in order
            hi = mid                        #> so the smallest is here or to the left
    return nums[lo]                         #> the smallest`,
    demo: py`
nums = [4, 5, 6, 7, 0, 1, 2]                #> rotated
show(nums, "nums")                          #> draw them: see the drop?
print(rotated_min(nums))                    #> 0`,
    tests: [
      [[[3, 4, 5, 1, 2]], 1],
      [[[4, 5, 6, 7, 0, 1, 2]], 0],
      [[[11, 13, 15, 17]], 11],
      [[[2, 1]], 1],
    ],
    gremlins: [
      ['just one number', [[1]], 1],
      ['the smallest is last', [[2, 3, 4, 5, 1]], 1],
      ['the smallest is second', [[5, 1, 2, 3, 4]], 1],
    ],
    setup: py`
def make_input(n):
    k = n // 3
    return list(range(k, n)) + list(range(k))`,
    call: 'rotated_min(make_input(n))',
    target: 'O(log n)',
    big: 1000000,
    hints: [
      'Draw it: the numbers climb, drop suddenly, then climb again. The smallest is right after the drop.',
      'Compare the middle with the right end. If the middle is bigger, the drop must be to the right of the middle.',
      'While `lo < hi`: if `nums[mid] > nums[hi]`, `lo = mid + 1`, else `hi = mid`. Return `nums[lo]`.',
    ],
    scale: {
      text: 'Logs that wrap around (a ring buffer that overwrites its oldest entries) are rotated sorted lists. Finding the oldest entry among millions is this puzzle.',
    },
  },

  // ───────────────────────────── heaps
  {
    id: 'stones',
    st: 'heap',
    tier: 'warm',
    title: 'Last stone',
    lc: [1046, 'last-stone-weight'],
    hook: 'Smash the two heaviest stones until one is left.',
    md: 'Take the two heaviest stones and smash them together. If they weigh the same, both vanish; otherwise a stone weighing the difference is left. Repeat until at most one stone remains, and return its weight (`0` if none).',
    fn: 'last_stone',
    startWorks: true,
    start: py`
def last_stone(stones):                     #> take the stone weights
    stones = stones[:]                      #> work on a copy
    while len(stones) > 1:                  #> while two or more stones remain
        stones.sort()                       #> line them all up, lightest first (every round!)
        a = stones.pop()                    #> take the heaviest
        b = stones.pop()                    #> and the next heaviest
        if a != b:                          #> not the same weight?
            stones.append(a - b)            #> the difference is left
    return stones[0] if stones else 0       #> what's left`,
    fast: py`
import heapq                                #> Python's heap tools

def last_stone(stones):                     #> take the stone weights
    heap = [-s for s in stones]             #> heapq keeps the smallest on top, so store them negative
    heapq.heapify(heap)                     #> arrange them into a heap
    while len(heap) > 1:                    #> while two or more stones remain
        a = -heapq.heappop(heap)            #> take the heaviest
        b = -heapq.heappop(heap)            #> and the next heaviest
        if a != b:                          #> not the same weight?
            heapq.heappush(heap, -(a - b))  #> the difference goes back on the heap
    return -heap[0] if heap else 0          #> what's left`,
    demo: py`
stones = [2, 7, 4, 1, 8, 1]                 #> six stones
show(stones, "stones")                      #> draw them
print(last_stone(stones))                   #> 1`,
    tests: [
      [[[2, 7, 4, 1, 8, 1]], 1],
      [[[1]], 1],
      [[[3, 3]], 0],
      [[[10, 4, 2]], 4],
    ],
    gremlins: [
      ['three the same', [[5, 5, 5]], 5],
      ['four the same', [[1, 1, 1, 1]], 0],
      ['two different', [[9, 3]], 6],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(1, 1000) for _ in range(n)]`,
    call: 'last_stone(make_input(n))',
    target: 'O(n log n)',
    big: 30000,
    hints: [
      'Each round you only need the two heaviest stones. Sorting everything every round is a lot of extra work.',
      'A heap hands you the biggest item quickly, and lets you add one back quickly.',
      '`heapq` keeps the *smallest* on top, so store weights as negatives. `heappop` twice, `heappush` the difference.',
    ],
    scale: {
      text: 'Your computer decides which program runs next with a priority queue: a heap of jobs ordered by urgency. It picks the next job thousands of times a second.',
      real: {
        label: 'Python’s heapq module',
        url: 'https://github.com/python/cpython/blob/main/Lib/heapq.py',
      },
    },
  },
  {
    id: 'kth',
    st: 'heap',
    tier: 'classic',
    title: 'K-th largest',
    lc: [215, 'kth-largest-element-in-an-array'],
    hook: 'Find the k-th biggest number.',
    md: 'Return the `k`-th largest number in `nums` (`k = 1` is the biggest). Repeated numbers count separately: in `[7, 7, 3]` the 2nd largest is `7`.',
    fn: 'kth_largest',
    startWorks: true,
    start: py`
def kth_largest(nums, k):                   #> take the numbers and k
    nums = nums[:]                          #> work on a copy
    for _ in range(k - 1):                  #> k - 1 times…
        nums.remove(max(nums))              #> …find the biggest and throw it away (two scans!)
    return max(nums)                        #> now the biggest left is the answer`,
    fast: py`
import heapq                                #> Python's heap tools

def kth_largest(nums, k):                   #> take the numbers and k
    top = []                                #> the k biggest so far; the smallest of them on top
    for x in nums:                          #> look at each number once
        heapq.heappush(top, x)              #> add it
        if len(top) > k:                    #> more than k?
            heapq.heappop(top)              #> drop the smallest
    return top[0]                           #> the smallest of the top k is the k-th largest`,
    demo: py`
nums = [3, 2, 1, 5, 6, 4]                   #> some numbers
show(nums, "nums")                          #> draw them
print(kth_largest(nums, 2))                 #> 5`,
    tests: [
      [[[3, 2, 1, 5, 6, 4], 2], 5],
      [[[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], 4],
      [[[1], 1], 1],
      [[[7, 7, 7], 2], 7],
    ],
    gremlins: [
      ['negative numbers', [[-1, -5, -3], 1], -1],
      ['k is the whole list', [[2, 1], 2], 1],
      ['ties in the middle', [[5, 5, 4, 4], 3], 4],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(1, 10 ** 6) for _ in range(n)], n // 2`,
    call: 'kth_largest(*make_input(n))',
    target: 'O(n log n)',
    big: 100000,
    hints: [
      'You don’t care about the order of the top `k`. You only care about the smallest of them.',
      'Keep a heap of the `k` biggest numbers seen so far. Its top (the smallest of them) is your answer.',
      'For each `x`: `heappush(top, x)`; if `len(top) > k`, `heappop(top)`. Return `top[0]`.',
    ],
    scale: {
      text: 'Search engines keep the top 10 results out of millions of matches with exactly this: a heap that never holds more than 10. Apache Lucene (inside Elasticsearch) has its own little priority queue for it.',
      real: {
        label: 'Lucene’s PriorityQueue',
        url: 'https://github.com/apache/lucene/blob/main/lucene/core/src/java/org/apache/lucene/util/PriorityQueue.java',
      },
    },
  },
  {
    id: 'topk',
    st: 'heap',
    tier: 'boss',
    title: 'Top k most frequent',
    lc: [347, 'top-k-frequent-elements'],
    hook: 'Which k numbers show up the most?',
    md: 'Return the `k` numbers that appear most often in `nums`, most frequent first.',
    fn: 'top_k',
    startWorks: true,
    start: py`
def top_k(nums, k):                         #> take the numbers and k
    counts = []                             #> pairs of (how often, number)
    for x in set(nums):                     #> for each different number
        counts.append((nums.count(x), x))   #> count it by scanning the whole list
    counts.sort(reverse=True)               #> most frequent first
    return [x for _, x in counts[:k]]       #> just the top k numbers`,
    fast: py`
def top_k(nums, k):                         #> take the numbers and k
    counts = {}                             #> number → how often
    for x in nums:                          #> one pass to count everything
        counts[x] = counts.get(x, 0) + 1    #> one more of x
    buckets = [[] for _ in range(len(nums) + 1)]  #> bucket c holds numbers seen c times
    for x, c in counts.items():             #> drop each number in its bucket
        buckets[c].append(x)                #> no sorting needed
    out = []                                #> the answer
    for c in range(len(nums), 0, -1):       #> walk the buckets, most frequent first
        for x in buckets[c]:                #> each number in this bucket
            out.append(x)                   #> take it
            if len(out) == k:               #> got k?
                return out                  #> done
    return out                              #> (fewer than k different numbers)`,
    demo: py`
nums = [1, 1, 1, 2, 2, 3]                   #> 1 three times, 2 twice
print(top_k(nums, 2))                       #> [1, 2]`,
    tests: [
      [
        [[1, 1, 1, 2, 2, 3], 2],
        [1, 2],
      ],
      [[[1], 1], [1]],
      [
        [[4, 4, 4, 4, 5, 5, 5, 6, 6, 7], 3],
        [4, 5, 6],
      ],
      [[[9, 8, 9, 8, 9], 1], [9]],
    ],
    gremlins: [
      ['negative numbers', [[-1, -1, 2], 1], [-1]],
      ['order matters', [[3, 3, 3, 1, 1, 2], 2], [3, 1]],
      ['the last number wins', [[5, 5, 6, 6, 6, 7, 7, 7, 7], 3], [7, 6, 5]],
    ],
    setup: py`
def make_input(n):
    return [i // 2 for i in range(n)], 10`,
    call: 'top_k(*make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      '`nums.count(x)` scans the whole list. Doing that for every different number is the slow part.',
      'Count everything in one pass with a dictionary. Then you need the biggest counts, without a full sort if you can.',
      'No number appears more than `len(nums)` times, so make a bucket for each count and read the buckets from the top.',
    ],
    scale: {
      text: 'Counting billions of items exactly needs a lot of memory, so trending-topic systems use *sketches*: small structures that count approximately. Reddit counts views per post with a cousin of this idea, HyperLogLog.',
      idea: 'hll',
    },
  },

  // ───────────────────────────── trees
  {
    id: 'depth',
    st: 'tree',
    tier: 'warm',
    title: 'How deep is the tree?',
    lc: [104, 'maximum-depth-of-binary-tree'],
    hook: 'Count the levels of a tree.',
    md: 'Return how many levels the tree has: the number of nodes on the longest path from the top down to a leaf. LeetCode sends the tree as a list, row by row, with `None` for gaps; `build` turns it into a real tree for you.',
    fn: 'check',
    startWorks: false,
    start: py`
def max_depth(root):                        #> take the top of a tree
    if root is None:                        #> an empty tree…
        return 0                            #> …has no levels
    # TODO: this only counts the top. Look inside the children!
    return 1                                #> one level (for now)`,
    fast: py`
def max_depth(root):                        #> take the top of a tree
    if root is None:                        #> an empty tree…
        return 0                            #> …has no levels
    return 1 + max(max_depth(root.left), max_depth(root.right))  #> this level, plus the deeper side`,
    helpers:
      TREE +
      py`

def check(values):                          #> how the tests call your code
    return max_depth(build(values))         #> build the tree, then measure it`,
    demo: py`
tree = build([3, 9, 20, None, None, 15, 7]) #> a small tree
show(tree, "tree")                          #> draw it
print(max_depth(tree))                      #> 3 levels`,
    tests: [
      [[[3, 9, 20, null, null, 15, 7]], 3],
      [[[1, null, 2]], 2],
      [[[]], 0],
      [[[1]], 1],
    ],
    gremlins: [
      ['a long chain down the left', [[1, 2, null, 3, null, 4]], 4],
      ['a full tree', [[1, 2, 3, 4, 5, 6, 7]], 3],
      ['a single zero', [[0]], 1],
    ],
    setup: TREE_INPUT,
    call: 'max_depth(make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      'A tree is a node with two smaller trees hanging off it. If you knew how deep each smaller tree was, could you answer?',
      'The depth is 1 (this node) plus the depth of the deeper child.',
      '`return 1 + max(max_depth(root.left), max_depth(root.right))`',
    ],
    scale: {
      text: 'Trees are everywhere: the folders on your Mac, the web page you’re reading (the DOM), and Git, which stores your whole project as a tree of fingerprints (a Merkle tree).',
      idea: 'merkle',
    },
  },
  {
    id: 'invert',
    st: 'tree',
    tier: 'classic',
    title: 'Flip the tree',
    lc: [226, 'invert-binary-tree'],
    hook: 'Mirror a tree: every left becomes right.',
    md: 'Mirror the tree: every node’s left and right children swap places, all the way down. Return the top of the flipped tree.',
    fun: 'In 2015 the author of Homebrew (the tool most Mac developers use to install software) tweeted that Google turned him down after he couldn’t invert a binary tree on a whiteboard. It became the most famous interview puzzle on the internet.',
    fn: 'check',
    startWorks: false,
    start: py`
def invert(root):                           #> take the top of a tree
    if root is None:                        #> nothing here?
        return None                         #> nothing to flip
    # TODO: swap root.left and root.right, and flip each side too
    return root                             #> hand back the top`,
    fast: py`
def invert(root):                           #> take the top of a tree
    if root is None:                        #> nothing here?
        return None                         #> nothing to flip
    root.left, root.right = invert(root.right), invert(root.left)  #> flip both sides, then swap them
    return root                             #> hand back the top`,
    helpers:
      TREE +
      py`

def to_list(root):                          #> turn a tree back into LeetCode's list
    out, queue = [], [root]                 #> the list so far; nodes to visit, row by row
    while queue:                            #> while there are nodes to visit
        node = queue.pop(0)                 #> the next one
        if node is None:                    #> a gap
            out.append(None)                #> write None
            continue                        #> nothing below a gap
        out.append(node.val)                #> write its value
        queue.append(node.left)             #> visit its left child later
        queue.append(node.right)            #> and its right child
    while out and out[-1] is None:          #> drop the gaps at the very end
        out.pop()                           #> LeetCode leaves them out
    return out                              #> the list

def check(values):                          #> how the tests call your code
    return to_list(invert(build(values)))   #> build, flip, and read the tree back`,
    demo: py`
tree = build([4, 2, 7, 1, 3, 6, 9])         #> a small tree
show(tree, "before")                        #> draw it
show(invert(tree), "flipped")               #> and mirrored`,
    tests: [
      [[[4, 2, 7, 1, 3, 6, 9]], [4, 7, 2, 9, 6, 3, 1]],
      [[[2, 1, 3]], [2, 3, 1]],
      [[[]], []],
      [[[1, 2]], [1, null, 2]],
    ],
    gremlins: [
      ['a single node', [[1]], [1]],
      ['only a right child', [[1, null, 2]], [1, 2]],
      ['a chain down the left', [[5, 4, null, 3]], [5, null, 4, null, 3]],
    ],
    setup: TREE_INPUT,
    call: 'invert(make_input(n))',
    target: 'O(n)',
    big: 10000,
    hints: [
      'Flipping a tree means flipping its left part, flipping its right part, and swapping them.',
      'That’s recursion: `invert` the children first, then swap.',
      '`root.left, root.right = invert(root.right), invert(root.left)`, then `return root`.',
    ],
    scale: {
      text: 'Trees hold huge things: a browser page can have tens of thousands of nodes, and a file system millions. Walking them once (O(n)) is the most any of these jobs should cost.',
    },
  },
  {
    id: 'lca',
    st: 'tree',
    tier: 'boss',
    title: 'Lowest common ancestor',
    lc: [235, 'lowest-common-ancestor-of-a-binary-search-tree'],
    hook: 'In a search tree, find where two values’ paths split.',
    md: 'In a **binary search tree**, everything on a node’s left is smaller and everything on its right is bigger. Return the value of the lowest node that has both `p` and `q` underneath it (a node counts as being under itself). Use the ordering!',
    fn: 'check',
    startWorks: true,
    start: py`
def path_to(root, target):                  #> find the way from the top down to target
    if root is None:                        #> fell off the tree
        return None                         #> not down here
    if root.val == target:                  #> found it
        return [root]                       #> the path is just this node
    for child in (root.left, root.right):   #> otherwise search both sides (ignoring the order)
        p = path_to(child, target)          #> look down this side
        if p:                               #> found down there?
            return [root] + p               #> add this node to the front
    return None                             #> not anywhere below

def lowest_common(root, p, q):              #> take a tree and two values
    a, b = path_to(root, p), path_to(root, q)  #> both paths from the top
    last = None                             #> the last node both paths share
    for x, y in zip(a, b):                  #> walk down both paths together
        if x is not y:                      #> they split here
            break                           #> stop
        last = x                            #> still the same node
    return last.val                         #> the lowest shared node`,
    fast: py`
def lowest_common(root, p, q):              #> take a tree and two values
    node = root                             #> start at the top
    while node:                             #> walk down
        if p < node.val and q < node.val:   #> both smaller?
            node = node.left                #> they're both on the left
        elif p > node.val and q > node.val: #> both bigger?
            node = node.right               #> they're both on the right
        else:                               #> they split here (or one of them is here)
            return node.val                 #> this is the lowest common ancestor`,
    helpers:
      TREE +
      py`

def check(values, p, q):                    #> how the tests call your code
    return lowest_common(build(values), p, q)  #> build the tree, then search it`,
    demo: py`
tree = build([6, 2, 8, 0, 4, 7, 9, None, None, 3, 5])  #> a search tree
show(tree, "tree")                          #> draw it
print(lowest_common(tree, 3, 5))            #> 4`,
    tests: [
      [[[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 8], 6],
      [[[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 4], 2],
      [[[2, 1], 2, 1], 2],
      [[[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 3, 5], 4],
    ],
    gremlins: [
      ['both on the right', [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 7, 9], 8],
      ['far apart on one side', [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 0, 5], 2],
      ['opposite corners', [[5, 3, 8, 1, 4, 7, 9], 1, 9], 5],
    ],
    setup: py`
def make_input(n):
    def grow(lo, hi):
        if lo > hi: return None
        mid = (lo + hi) // 2
        return Node(mid, grow(lo, mid - 1), grow(mid + 1, hi))
    return grow(0, n - 1), n - 1, n - 2`,
    call: 'lowest_common(*make_input(n))',
    target: 'O(log n)',
    big: 100000,
    hints: [
      'The obvious way searches the whole tree as if it had no order. But the order tells you which way to go.',
      'If both values are smaller than this node, the answer must be on the left. Both bigger: on the right.',
      'Walk down from the top: go left while both are smaller, right while both are bigger, and stop when they split.',
    ],
    scale: {
      text: 'Databases store their indexes as search trees (B-trees) with hundreds of children per node, so finding one row among a billion takes about four steps down the tree.',
      real: {
        label: 'SQLite’s B-tree',
        url: 'https://github.com/sqlite/sqlite/blob/master/src/btree.c',
      },
    },
  },

  // ───────────────────────────── graphs & grids
  {
    id: 'flood',
    st: 'graph',
    tier: 'warm',
    title: 'Paint bucket',
    lc: [733, 'flood-fill'],
    hook: 'Repaint a square and every connected square of its colour.',
    md: 'This is the paint-bucket tool. Starting at row `r`, column `c`, repaint that square and every square connected to it (up, down, left, right) that has the same colour. Return the picture.',
    fun: 'The obvious way, recursion, works on small pictures, then crashes on big ones. Press **Check** and watch it happen.',
    fn: 'flood',
    startWorks: true,
    start: py`
def flood(grid, r, c, color):               #> take the picture, a start square and a new colour
    old = grid[r][c]                        #> the colour we're replacing
    if old == color:                        #> already that colour?
        return grid                         #> nothing to do
    def paint(r, c):                        #> paint one square, then its neighbours
        if 0 <= r < len(grid) and 0 <= c < len(grid[0]) and grid[r][c] == old:  #> inside the picture and the old colour?
            grid[r][c] = color              #> repaint it
            paint(r + 1, c)                 #> spread down…
            paint(r - 1, c)                 #> …up…
            paint(r, c + 1)                 #> …right…
            paint(r, c - 1)                 #> …and left
    paint(r, c)                             #> start spreading
    return grid                             #> the repainted picture`,
    fast: py`
from collections import deque               #> a queue that's quick at both ends

def flood(grid, r, c, color):               #> take the picture, a start square and a new colour
    old = grid[r][c]                        #> the colour we're replacing
    if old == color:                        #> already that colour?
        return grid                         #> nothing to do
    grid[r][c] = color                      #> paint the start square
    queue = deque([(r, c)])                 #> squares whose neighbours we still need to check
    while queue:                            #> while the ripple is still spreading
        r, c = queue.popleft()              #> the oldest square in the queue
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):  #> its four neighbours
            nr, nc = r + dr, c + dc         #> the neighbour's position
            if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] == old:  #> inside, and the old colour?
                grid[nr][nc] = color        #> paint it
                queue.append((nr, nc))      #> and check its neighbours later
    return grid                             #> the repainted picture`,
    demo: py`
picture = [[1, 1, 1, 0], [1, 1, 0, 0], [1, 0, 0, 1]]  #> a tiny picture: colours 0 and 1
show(picture, "before")                     #> draw it
show(flood(picture, 0, 0, 2), "after")      #> paint from the top-left corner`,
    tests: [
      [
        [
          [
            [1, 1, 1],
            [1, 1, 0],
            [1, 0, 1],
          ],
          1,
          1,
          2,
        ],
        [
          [2, 2, 2],
          [2, 2, 0],
          [2, 0, 1],
        ],
      ],
      [
        [
          [
            [0, 0, 0],
            [0, 0, 0],
          ],
          0,
          0,
          0,
        ],
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
      ],
      [
        [
          [
            [0, 1],
            [1, 0],
          ],
          0,
          0,
          3,
        ],
        [
          [3, 1],
          [1, 0],
        ],
      ],
    ],
    gremlins: [
      ['a one-square picture', [[[5]], 0, 0, 7], [[7]]],
      ['a single row', [[[1, 2, 1]], 0, 1, 1], [[1, 1, 1]]],
      [
        'start in a corner',
        [
          [
            [1, 1],
            [1, 1],
          ],
          1,
          1,
          4,
        ],
        [
          [4, 4],
          [4, 4],
        ],
      ],
    ],
    setup: py`
def make_input(n):
    side = max(2, int(n ** 0.5))
    return [[1] * side for _ in range(side)], 0, 0, 2`,
    call: 'flood(*make_input(n))',
    fresh: true,
    target: 'O(n)',
    big: 1000000,
    hints: [
      'Recursion remembers every square it’s in the middle of. Python only lets that pile get about 1,000 deep.',
      'Use your own to-do list of squares instead: a queue. Take one out, paint its neighbours, add them to the queue.',
      'Paint the start, put it in a `deque`. While the queue isn’t empty: `popleft()`, and for each matching neighbour, paint it and `append` it.',
    ],
    scale: {
      text: 'Paint programs, Photoshop’s magic wand and Minesweeper’s auto-reveal all flood-fill. A 12-megapixel photo would need 12 million nested calls, so real tools use a queue, or paint whole rows at a time.',
    },
  },
  {
    id: 'islands',
    st: 'graph',
    tier: 'classic',
    title: 'Count the islands',
    lc: [200, 'number-of-islands'],
    hook: 'How many separate islands are on the map?',
    md: 'The map has land (`1`) and water (`0`). Land squares touching up, down, left or right belong to the same island. Return how many islands there are. (LeetCode writes the squares as text, `"1"` and `"0"`.)',
    fn: 'islands',
    startWorks: false,
    start: py`
def islands(grid):                          #> take a map of 1s (land) and 0s (water)
    count = 0                               #> islands found so far
    for r in range(len(grid)):              #> each row
        for c in range(len(grid[0])):       #> each square in the row
            if grid[r][c] == 1:             #> land!
                count += 1                  #> count it
                # TODO: this counts land squares, not islands. Sink the whole island here.
    return count                            #> how many`,
    fast: py`
from collections import deque               #> a queue that's quick at both ends

def islands(grid):                          #> take a map of 1s (land) and 0s (water)
    count = 0                               #> islands found so far
    for r in range(len(grid)):              #> each row
        for c in range(len(grid[0])):       #> each square in the row
            if grid[r][c] == 1:             #> new land we haven't sunk yet
                count += 1                  #> a new island!
                grid[r][c] = 0              #> sink this square
                queue = deque([(r, c)])     #> then spread out from it
                while queue:                #> while the ripple spreads
                    y, x = queue.popleft()  #> the next square
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):  #> its four neighbours
                        if 0 <= ny < len(grid) and 0 <= nx < len(grid[0]) and grid[ny][nx] == 1:  #> land?
                            grid[ny][nx] = 0  #> sink it (so it's never counted again)
                            queue.append((ny, nx))  #> and spread from it later
    return count                            #> how many`,
    demo: py`
sea = [[1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]  #> 1 is land, 0 is water
show(sea, "map")                            #> draw it
print(islands(sea))                         #> 3 islands`,
    tests: [
      [
        [
          [
            [1, 1, 0, 0],
            [1, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ],
        ],
        3,
      ],
      [
        [
          [
            [1, 1, 1],
            [0, 1, 0],
            [1, 1, 1],
          ],
        ],
        1,
      ],
      [
        [
          [
            [0, 0],
            [0, 0],
          ],
        ],
        0,
      ],
      [[[[1, 0, 1, 0, 1]]], 3],
    ],
    gremlins: [
      ['one square of land', [[[1]]], 1],
      [
        'corners don’t touch',
        [
          [
            [1, 0],
            [0, 1],
          ],
        ],
        2,
      ],
      [
        'all land',
        [
          [
            [1, 1],
            [1, 1],
          ],
        ],
        1,
      ],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    side = max(2, int(n ** 0.5))
    return [[1 if random.random() < 0.45 else 0 for _ in range(side)] for _ in range(side)]`,
    call: 'islands(make_input(n))',
    fresh: true,
    target: 'O(n)',
    big: 90000,
    hints: [
      'When you find land, it’s a new island only if you haven’t already counted it as part of another one.',
      'So when you find new land, sink the whole island (turn it to 0) by spreading out from it. Then it can’t be counted again.',
      'On new land: `count += 1`, set it to 0, and run a queue that sinks every connected land square.',
    ],
    scale: {
      text: 'Same question on a social network: “how many separate friend groups are there?” is counting islands on a graph of billions of people. Google’s PageRank works on a graph like that: the whole web.',
      idea: 'pagerank',
    },
  },
  {
    id: 'oranges',
    st: 'graph',
    tier: 'boss',
    title: 'Rotting oranges',
    lc: [994, 'rotting-oranges'],
    hook: 'Rot spreads each minute. How long until it’s everywhere?',
    md: 'In a crate, `0` is empty, `1` is a fresh orange and `2` is a rotten one. Every minute, rotten oranges rot their fresh neighbours (up, down, left, right). Return how many minutes until nothing is fresh, or `-1` if some orange never rots.',
    fn: 'minutes_to_rot',
    startWorks: true,
    start: py`
def minutes_to_rot(grid):                   #> take the crate: 0 empty, 1 fresh, 2 rotten
    grid = [row[:] for row in grid]         #> work on a copy
    minutes = 0                             #> the clock starts at 0
    while True:                             #> minute by minute
        to_rot = []                         #> fresh oranges that rot this minute
        for r in range(len(grid)):          #> scan the whole crate, every minute
            for c in range(len(grid[0])):   #> every square
                if grid[r][c] == 1:         #> a fresh orange
                    for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):  #> its four neighbours
                        if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] == 2:  #> a rotten one?
                            to_rot.append((r, c))  #> this orange will rot
                            break           #> no need to check more neighbours
        if not to_rot:                      #> nothing rotted this minute
            break                           #> the spreading has stopped
        for r, c in to_rot:                 #> rot them all at once
            grid[r][c] = 2                  #> now rotten
        minutes += 1                        #> one more minute
    fresh = any(1 in row for row in grid)   #> any fresh oranges left?
    return -1 if fresh else minutes         #> stuck, or how long it took`,
    fast: py`
from collections import deque               #> a queue that's quick at both ends

def minutes_to_rot(grid):                   #> take the crate: 0 empty, 1 fresh, 2 rotten
    grid = [row[:] for row in grid]         #> work on a copy
    queue = deque()                         #> rotten oranges whose neighbours we still need to rot
    fresh = 0                               #> how many fresh oranges there are
    for r in range(len(grid)):              #> one scan to start
        for c in range(len(grid[0])):       #> every square
            if grid[r][c] == 2:             #> rotten from the start
                queue.append((r, c, 0))     #> it spreads from minute 0
            elif grid[r][c] == 1:           #> fresh
                fresh += 1                  #> count it
    minutes = 0                             #> the latest minute anything rotted
    while queue:                            #> the rot spreads in rings
        r, c, m = queue.popleft()           #> an orange that went rotten at minute m
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):  #> its four neighbours
            if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] == 1:  #> a fresh one?
                grid[nr][nc] = 2            #> it rots…
                fresh -= 1                  #> …one fewer fresh orange
                minutes = m + 1             #> …at minute m + 1
                queue.append((nr, nc, m + 1))  #> and it will spread too
    return -1 if fresh else minutes         #> stuck, or how long it took`,
    demo: py`
crate = [[2, 1, 1], [1, 1, 0], [0, 1, 1]]   #> one rotten orange in the corner
show(crate, "crate")                        #> draw it
print(minutes_to_rot(crate))                #> 4 minutes`,
    tests: [
      [
        [
          [
            [2, 1, 1],
            [1, 1, 0],
            [0, 1, 1],
          ],
        ],
        4,
      ],
      [
        [
          [
            [2, 1, 1],
            [0, 1, 1],
            [1, 0, 1],
          ],
        ],
        -1,
      ],
      [[[[0, 2]]], 0],
      [[[[2, 1, 1, 1]]], 3],
    ],
    gremlins: [
      ['an empty crate', [[[0]]], 0],
      ['one fresh orange alone', [[[1]]], -1],
      [
        'two rotten, two fresh',
        [
          [
            [2, 2],
            [1, 1],
          ],
        ],
        1,
      ],
    ],
    setup: py`
def make_input(n):
    return [[2] + [1] * (n - 1)]`,
    call: 'minutes_to_rot(make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      'The obvious way rescans the entire crate every single minute, even the parts where nothing is happening.',
      'Only the oranges that *just* went rotten can rot anything new. Keep them in a queue, with the minute they rotted.',
      'Put every rotten orange in a queue with minute 0. Pop one, rot its fresh neighbours at minute + 1, and add them to the queue.',
    ],
    scale: {
      text: 'This is how epidemics, rumours and computer viruses are modelled: “minutes” become “hops” across a network, and the same queue-of-rings tells you how fast something spreads.',
    },
  },

  // ───────────────────────────── dynamic programming
  {
    id: 'stairs',
    st: 'dp',
    tier: 'warm',
    title: 'Climbing stairs',
    lc: [70, 'climbing-stairs'],
    hook: '1 or 2 steps at a time: how many ways up?',
    md: 'You can climb 1 or 2 steps at a time. How many different ways are there to climb `n` steps?',
    fun: 'The obvious way is beautiful and correct, and it doubles its work with every extra step. Press **Check** to see how long 100 steps would take.',
    fn: 'ways',
    startWorks: true,
    start: py`
def ways(n):                                #> take the number of steps
    if n <= 1:                              #> zero or one step left…
        return 1                            #> …only one way to do it
    return ways(n - 1) + ways(n - 2)        #> the last move was 1 step, or 2 steps`,
    fast: py`
def ways(n):                                #> take the number of steps
    a, b = 1, 1                             #> ways to climb 0 steps, and 1 step
    for _ in range(n - 1):                  #> work upwards one step at a time
        a, b = b, a + b                     #> the next answer is the sum of the last two
    return b                                #> ways to climb n steps`,
    demo: py`
for n in range(1, 8):                       #> stairs of 1 to 7 steps
    print(n, "steps:", ways(n), "ways")     #> 1, 2, 3, 5, 8, 13, 21… look familiar?`,
    tests: [
      [[2], 2],
      [[3], 3],
      [[5], 8],
      [[10], 89],
    ],
    gremlins: [
      ['one step', [1], 1],
      ['zero steps', [0], 1],
      ['25 steps', [25], 121393],
    ],
    setup: py`
def make_input(n):
    return n`,
    call: 'ways(make_input(n))',
    ns: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40],
    rungs: [
      [10, '🏠', 'a house'],
      [30, '🏢', 'an office block'],
      [45, '🧩', 'LeetCode’s biggest'],
      [100, '🗽', 'a tall tower'],
    ],
    target: 'O(n)',
    big: 45,
    hints: [
      'Draw the calls for `ways(5)`. How many times does it work out `ways(2)` from scratch?',
      'Write each answer down the first time you work it out. Every answer only needs the two below it.',
      'Count upwards with two variables: `a, b = 1, 1`, then repeat `a, b = b, a + b`.',
    ],
    scale: {
      text: 'Writing answers down to reuse them is how GitHub can show you a diff between two huge files: a table of small answers (“how similar are these two beginnings?”) built up one cell at a time.',
      idea: 'diff',
      real: {
        label: 'Python’s difflib',
        url: 'https://github.com/python/cpython/blob/main/Lib/difflib.py',
      },
    },
  },
  {
    id: 'robber',
    st: 'dp',
    tier: 'classic',
    title: 'Never two in a row',
    lc: [198, 'house-robber'],
    hook: 'Biggest total, never taking two neighbours.',
    md: 'A cat burglar walks down a row of houses with money in them, but alarms go off if two **neighbouring** houses are robbed. What’s the most money they can take?',
    fn: 'best_take',
    startWorks: true,
    start: py`
def best_take(houses):                      #> take the money in each house
    def best_from(i):                       #> the best total from house i to the end
        if i >= len(houses):                #> past the last house
            return 0                        #> nothing more to take
        take = houses[i] + best_from(i + 2) #> take this one, skip its neighbour
        skip = best_from(i + 1)             #> or skip this one
        return max(take, skip)              #> whichever gives more
    return best_from(0)                     #> start at the first house`,
    fast: py`
def best_take(houses):                      #> take the money in each house
    take, skip = 0, 0                       #> best total if we took the last house, or didn't
    for money in houses:                    #> walk down the street once
        take, skip = skip + money, max(take, skip)  #> take this one (so we skipped the last), or skip it
    return max(take, skip)                  #> the better ending`,
    demo: py`
street = [2, 7, 9, 3, 1]                    #> money in each house
show(street, "street")                      #> draw it
print(best_take(street))                    #> 2 + 9 + 1 = 12`,
    tests: [
      [[[1, 2, 3, 1]], 4],
      [[[2, 7, 9, 3, 1]], 12],
      [[[5]], 5],
      [[[2, 1, 1, 2]], 4],
    ],
    gremlins: [
      ['an empty street', [[]], 0],
      ['empty houses', [[0, 0, 0]], 0],
      ['rich ends', [[10, 1, 1, 10]], 20],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    return [random.randint(1, 100) for _ in range(n)]`,
    call: 'best_take(make_input(n))',
    ns: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36],
    rungs: [
      [10, '🏘', 'a street'],
      [50, '🏙', 'a long road'],
      [100, '🧩', 'LeetCode’s biggest'],
      [1000, '🌆', 'a whole town'],
    ],
    target: 'O(n)',
    big: 100,
    hints: [
      '`best_from(5)` gets worked out again and again, by different paths. Count how often for 10 houses.',
      'Walk down the street once, keeping two numbers: the best total if you took the previous house, and if you didn’t.',
      'For each house: `take, skip = skip + money, max(take, skip)`. The answer is `max(take, skip)`.',
    ],
    scale: {
      text: 'Rules like “never two in a row” show up in scheduling: ad slots, shift rosters, which frames to keep in a video. They’re solved with the same running table, one step at a time.',
    },
  },
  {
    id: 'coins',
    st: 'dp',
    tier: 'boss',
    title: 'Fewest coins',
    lc: [322, 'coin-change'],
    hook: 'Make an amount with the fewest coins.',
    md: 'You have unlimited coins of the sizes in `coins`. Return the fewest coins that add up to exactly `amount`, or `-1` if it can’t be done.',
    fun: 'With real coins (1, 2, 5, 10…) “always take the biggest coin” happens to work. With coins of 1, 3 and 4, making 6 that way gives 4 + 1 + 1, but 3 + 3 is better. Only the table finds the true minimum.',
    fn: 'fewest_coins',
    startWorks: true,
    start: py`
def fewest_coins(coins, amount):            #> take the coin sizes and an amount
    if amount == 0:                         #> nothing left to pay
        return 0                            #> zero coins needed
    best = -1                               #> no way found yet
    for c in coins:                         #> try each coin as the first one
        if c <= amount:                     #> does it fit?
            rest = fewest_coins(coins, amount - c)  #> the best way to pay what's left
            if rest != -1 and (best == -1 or rest + 1 < best):  #> a new best?
                best = rest + 1             #> this coin plus the rest
    return best                             #> fewest coins (or -1)`,
    fast: py`
def fewest_coins(coins, amount):            #> take the coin sizes and an amount
    best = [0] + [float("inf")] * amount    #> best[a] = fewest coins for amount a (0 needs none)
    for a in range(1, amount + 1):          #> fill in amounts 1, 2, 3… in order
        for c in coins:                     #> try each coin as the last one
            if c <= a:                      #> does it fit?
                best[a] = min(best[a], best[a - c] + 1)  #> one coin plus the best for what's left
    return best[amount] if best[amount] != float("inf") else -1  #> the answer, or -1`,
    demo: py`
print(fewest_coins([1, 2, 5], 11))          #> 5 + 5 + 1: 3 coins
print(fewest_coins([1, 3, 4], 6))           #> 3 + 3: 2 coins`,
    tests: [
      [[[1, 2, 5], 11], 3],
      [[[2], 3], -1],
      [[[1], 0], 0],
      [[[1, 3, 4], 6], 2],
    ],
    gremlins: [
      ['the amount is too small', [[2, 5], 1], -1],
      ['only big coins', [[5, 10], 20], 2],
      ['ones and twos', [[1, 2], 7], 4],
    ],
    setup: py`
def make_input(n):
    return [1, 2, 5], n`,
    call: 'fewest_coins(*make_input(n))',
    ns: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
    rungs: [
      [10, '🪙', 'pocket change'],
      [100, '💵', 'a banknote'],
      [10000, '🧩', 'LeetCode’s biggest'],
      [1000000, '🏦', 'a bank vault'],
    ],
    target: 'O(n)',
    big: 10000,
    hints: [
      'The obvious way works out “fewest coins for 6” over and over, once for every path that reaches 6.',
      'Fill in a table for every amount from 0 up. Each amount only needs answers for smaller amounts.',
      '`best[a] = min(best[a], best[a - c] + 1)` for each coin `c` that fits, for `a` from 1 to `amount`.',
    ],
    scale: {
      text: 'Cash registers and vending machines solve this every day, and so do cloud systems packing jobs onto machines. When the table gets too big, they switch to “good enough” answers.',
    },
  },

  // ───────────────────────────── backtracking
  {
    id: 'subsets',
    st: 'backtrack',
    tier: 'classic',
    title: 'Every subset',
    lc: [78, 'subsets'],
    hook: 'List every way to pick some of the items.',
    md: 'Return every subset of `nums` (every way to pick some of the numbers, including none and all). The numbers are all different; the order doesn’t matter.',
    fun: 'Here there’s no faster trick: the answer itself doubles with every new number. Press **Check** to feel why some problems are hard by nature.',
    fn: 'check',
    startWorks: false,
    start: py`
def subsets(nums):                          #> take a list of different numbers
    out = []                                #> every subset we find
    def explore(i, chosen):                 #> decide about nums[i]; chosen = picked so far
        if i == len(nums):                  #> decided about every number
            out.append(chosen[:])           #> save a copy of this subset
            return                          #> go back
        # TODO: explore once WITHOUT nums[i], then once WITH it (and undo!)
    explore(0, [])                          #> start with nothing chosen
    return out                              #> all the subsets`,
    fast: py`
def subsets(nums):                          #> take a list of different numbers
    out = []                                #> every subset we find
    def explore(i, chosen):                 #> decide about nums[i]; chosen = picked so far
        if i == len(nums):                  #> decided about every number
            out.append(chosen[:])           #> save a copy of this subset
            return                          #> go back
        explore(i + 1, chosen)              #> choice 1: leave nums[i] out
        chosen.append(nums[i])              #> choice 2: put it in…
        explore(i + 1, chosen)              #> …and explore from there
        chosen.pop()                        #> undo, before going back
    explore(0, [])                          #> start with nothing chosen
    return out                              #> all the subsets`,
    helpers: py`
def check(nums):                            #> how the tests read your answer
    return sorted(sorted(s) for s in subsets(nums))  #> sort so that order doesn't matter`,
    demo: py`
print(subsets([1, 2, 3]))                   #> 8 subsets`,
    tests: [
      [[[1, 2, 3]], [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]],
      [[[0]], [[], [0]]],
      [[[]], [[]]],
      [[[5, 9]], [[], [5], [5, 9], [9]]],
    ],
    gremlins: [
      ['negative numbers', [[-1, 1]], [[], [-1], [-1, 1], [1]]],
      ['out of order', [[3, 1]], [[], [1], [1, 3], [3]]],
      [
        'four numbers',
        [[1, 2, 3, 4]],
        [
          [],
          [1],
          [1, 2],
          [1, 2, 3],
          [1, 2, 3, 4],
          [1, 2, 4],
          [1, 3],
          [1, 3, 4],
          [1, 4],
          [2],
          [2, 3],
          [2, 3, 4],
          [2, 4],
          [3],
          [3, 4],
          [4],
        ],
      ],
    ],
    setup: py`
def make_input(n):
    return list(range(n))`,
    call: 'subsets(make_input(n))',
    ns: [4, 6, 8, 10, 12, 14, 16, 18, 20],
    rungs: [
      [10, '🎒', 'a backpack'],
      [20, '🛒', 'a shopping cart'],
      [30, '🏪', 'a corner shop'],
      [64, '♟️', 'squares on a chessboard'],
    ],
    target: 'O(2ⁿ)',
    big: 10,
    hints: [
      'For each number there are exactly two choices: leave it out, or put it in.',
      'Explore “out” first, then add the number, explore “in”, and remove it again before going back up.',
      'In `explore`: `explore(i + 1, chosen)`, `chosen.append(nums[i])`, `explore(i + 1, chosen)`, `chosen.pop()`.',
    ],
    scale: {
      text: 'At 64 items there are more subsets than grains of sand on Earth. When a problem’s answer explodes like this, real systems stop listing everything and search smartly instead: pruning, good-enough answers, or a SAT solver.',
    },
  },
  {
    id: 'queens',
    st: 'backtrack',
    tier: 'boss',
    title: 'N queens',
    lc: [52, 'n-queens-ii'],
    hook: 'Place n queens so none attack each other.',
    md: 'Place `n` chess queens on an n×n board so that no two share a row, a column or a diagonal. Return how many ways there are.',
    fn: 'queens',
    startWorks: false,
    start: py`
def queens(n):                              #> take the board size
    count = 0                               #> solutions found
    cols, d1, d2 = set(), set(), set()      #> columns and diagonals already under attack
    def place(row):                         #> put a queen somewhere in this row
        nonlocal count                      #> we'll update the outer count
        if row == n:                        #> every row has a queen
            count += 1                      #> one more solution
            return                          #> go back and try other spots
        for col in range(n):                #> try each column in this row
            # TODO: skip attacked squares; otherwise mark them, place(row + 1), then unmark
            pass                            #> (nothing yet)
    place(0)                                #> start at the top row
    return count                            #> how many ways`,
    fast: py`
def queens(n):                              #> take the board size
    count = 0                               #> solutions found
    cols, d1, d2 = set(), set(), set()      #> columns and diagonals already under attack
    def place(row):                         #> put a queen somewhere in this row
        nonlocal count                      #> we'll update the outer count
        if row == n:                        #> every row has a queen
            count += 1                      #> one more solution
            return                          #> go back and try other spots
        for col in range(n):                #> try each column in this row
            if col in cols or row - col in d1 or row + col in d2:  #> under attack?
                continue                    #> skip this square
            cols.add(col); d1.add(row - col); d2.add(row + col)  #> place the queen: mark what it attacks
            place(row + 1)                  #> fill the rows below
            cols.remove(col); d1.remove(row - col); d2.remove(row + col)  #> pick the queen back up
    place(0)                                #> start at the top row
    return count                            #> how many ways`,
    demo: py`
print(queens(4))                            #> 2 ways on a 4×4 board
print(queens(6))                            #> 4 ways on a 6×6 board`,
    tests: [
      [[1], 1],
      [[4], 2],
      [[5], 10],
      [[6], 4],
    ],
    gremlins: [
      ['a 2×2 board', [2], 0],
      ['a 3×3 board', [3], 0],
      ['a real chessboard', [8], 92],
    ],
    setup: py`
def make_input(n):
    return n`,
    call: 'queens(make_input(n))',
    ns: [4, 5, 6, 7, 8, 9, 10, 11],
    rungs: [
      [8, '♟️', 'a chessboard'],
      [9, '🧩', 'LeetCode’s biggest'],
      [20, '🏟', 'a giant board'],
      [30, '🌌', 'a huge board'],
    ],
    target: 'O(n!)',
    big: 9,
    hints: [
      'Every row must have exactly one queen, so go row by row and choose a column.',
      'A square is attacked if its column, its `row - col` diagonal or its `row + col` diagonal is already taken.',
      'Skip attacked columns. Otherwise add to `cols`, `d1`, `d2`, call `place(row + 1)`, then remove them again.',
    ],
    scale: {
      text: 'Chip designers, timetable makers and airline schedulers face puzzles like this with thousands of pieces. Trying everything is hopeless, so they use SAT solvers: backtracking with very clever pruning.',
      real: {
        label: 'MiniSat, a famous SAT solver',
        url: 'https://github.com/niklasso/minisat/blob/master/minisat/core/Solver.cc',
      },
    },
  },

  // ───────────────────────────── intervals
  {
    id: 'meetings',
    st: 'intervals',
    tier: 'warm',
    title: 'Any clashes?',
    lc: null,
    hook: 'Can one person attend every meeting?',
    md: 'Each meeting is `[start, end]`. Return `True` if no two meetings overlap, so one person could attend them all. A meeting that ends at 5 doesn’t clash with one that starts at 5.',
    fn: 'no_clashes',
    startWorks: true,
    start: py`
def no_clashes(meetings):                   #> take [start, end] for each meeting
    for i in range(len(meetings)):          #> pick a meeting
        for j in range(i + 1, len(meetings)):  #> and every later one
            a, b = meetings[i], meetings[j] #> the two meetings
            if a[0] < b[1] and b[0] < a[1]: #> do they overlap?
                return False                #> a clash
    return True                             #> no two overlap`,
    fast: py`
def no_clashes(meetings):                   #> take [start, end] for each meeting
    meetings = sorted(meetings)             #> lay them out from earliest start to latest
    for i in range(1, len(meetings)):       #> walk through them in order
        if meetings[i][0] < meetings[i - 1][1]:  #> starts before the previous one ends?
            return False                    #> a clash
    return True                             #> no two overlap`,
    demo: py`
day = [[9, 10], [13, 15], [10, 11]]         #> three meetings
print(no_clashes(day))                      #> True: back to back is fine`,
    tests: [
      [
        [
          [
            [0, 30],
            [5, 10],
            [15, 20],
          ],
        ],
        false,
      ],
      [
        [
          [
            [7, 10],
            [2, 4],
          ],
        ],
        true,
      ],
      [
        [
          [
            [1, 5],
            [5, 8],
          ],
        ],
        true,
      ],
      [
        [
          [
            [1, 3],
            [2, 6],
            [8, 9],
          ],
        ],
        false,
      ],
    ],
    gremlins: [
      ['no meetings', [[]], true],
      ['one meeting', [[[1, 2]]], true],
      [
        'the clash is out of order',
        [
          [
            [5, 6],
            [1, 2],
            [3, 7],
          ],
        ],
        false,
      ],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    m = [[2 * i, 2 * i + 1] for i in range(n)]
    random.shuffle(m)
    return m`,
    call: 'no_clashes(make_input(n))',
    target: 'O(n log n)',
    big: 10000,
    hints: [
      'If the meetings were in order of start time, where could a clash possibly be?',
      'Only between neighbours! Sort by start time, then compare each meeting with the one just before it.',
      '`meetings = sorted(meetings)`, then for each `i`, check `meetings[i][0] < meetings[i - 1][1]`.',
    ],
    scale: {
      text: 'Google’s Spanner database treats time itself as an interval [earliest, latest], because clocks are never perfectly in sync. It waits out any overlap before it commits, so events across the world stay in order.',
      idea: 'truetime',
    },
  },
  {
    id: 'merge',
    st: 'intervals',
    tier: 'classic',
    title: 'Merge intervals',
    lc: [56, 'merge-intervals'],
    hook: 'Merge overlapping time ranges into one.',
    md: 'Merge all overlapping intervals (ones that touch, like `[1, 4]` and `[4, 5]`, count as overlapping) and return the result in order.',
    fn: 'merge',
    startWorks: true,
    start: py`
def merge(intervals):                       #> take [start, end] pairs
    result = []                             #> merged intervals so far
    for start, end in intervals:            #> for each interval
        i = 0                               #> look through everything we have
        while i < len(result):              #> each merged interval
            s, e = result[i]                #> its start and end
            if start <= e and s <= end:     #> they overlap (or touch)?
                start, end = min(s, start), max(e, end)  #> grow into one interval
                result.pop(i)               #> remove the old one
            else:                           #> no overlap
                i += 1                      #> check the next one
        result.append([start, end])         #> add the (maybe grown) interval
    return sorted(result)                   #> in order`,
    fast: py`
def merge(intervals):                       #> take [start, end] pairs
    out = []                                #> merged intervals, in order
    for start, end in sorted(intervals):    #> walk through them from earliest start
        if out and start <= out[-1][1]:     #> overlaps the last merged one?
            out[-1][1] = max(out[-1][1], end)  #> stretch it
        else:                               #> a gap
            out.append([start, end])        #> start a new interval
    return out                              #> the merged list`,
    demo: py`
busy = [[1, 3], [2, 6], [8, 10], [15, 18]]  #> busy times
print(merge(busy))                          #> [[1, 6], [8, 10], [15, 18]]`,
    tests: [
      [
        [
          [
            [1, 3],
            [2, 6],
            [8, 10],
            [15, 18],
          ],
        ],
        [
          [1, 6],
          [8, 10],
          [15, 18],
        ],
      ],
      [
        [
          [
            [1, 4],
            [4, 5],
          ],
        ],
        [[1, 5]],
      ],
      [
        [
          [
            [4, 7],
            [1, 4],
          ],
        ],
        [[1, 7]],
      ],
      [
        [
          [
            [1, 4],
            [2, 3],
          ],
        ],
        [[1, 4]],
      ],
    ],
    gremlins: [
      ['no intervals', [[]], []],
      ['a single point', [[[1, 1]]], [[1, 1]]],
      [
        'a bridge between two',
        [
          [
            [5, 6],
            [1, 2],
            [2, 5],
          ],
        ],
        [[1, 6]],
      ],
    ],
    setup: py`
import random
def make_input(n):
    random.seed(n)
    m = [[3 * i, 3 * i + 1] for i in range(n)]
    random.shuffle(m)
    return m`,
    call: 'merge(make_input(n))',
    target: 'O(n log n)',
    big: 10000,
    hints: [
      'If the intervals were sorted by start, an interval could only merge with the one you just finished.',
      'Sort them. Walk through, and either stretch the last merged interval or start a new one.',
      '`for start, end in sorted(intervals)`: if `start <= out[-1][1]`, stretch `out[-1][1]`; else append.',
    ],
    scale: {
      text: 'Calendar apps merge everyone’s busy times like this to find a free slot for 20 people at once. Genome tools merge billions of DNA ranges the same way: sort, then sweep.',
    },
  },

  // ───────────────────────────── design
  {
    id: 'minstack',
    st: 'design',
    tier: 'classic',
    title: 'Min stack',
    lc: [155, 'min-stack'],
    hook: 'A stack that tells you its smallest item instantly.',
    md: 'Build a stack with `push`, `pop`, `top` and `get_min`, where **every** operation is fast, including `get_min`. The tests send a list of instructions to `play`.',
    fn: 'play',
    startWorks: true,
    start: py`
class MinStack:                             #> a stack that also knows its smallest item
    def __init__(self):                     #> when it's created…
        self.items = []                     #> …it starts empty
    def push(self, x):                      #> add x on top
        self.items.append(x)                #> put it on the pile
    def pop(self):                          #> remove the top item
        self.items.pop()                    #> take it off the pile
    def top(self):                          #> look at the top item
        return self.items[-1]               #> the last one added
    def get_min(self):                      #> the smallest item
        return min(self.items)              #> look through the whole pile (slow!)`,
    fast: py`
class MinStack:                             #> a stack that also knows its smallest item
    def __init__(self):                     #> when it's created…
        self.items = []                     #> …it starts empty
        self.mins = []                      #> mins[i] = smallest of items[0..i]
    def push(self, x):                      #> add x on top
        self.items.append(x)                #> put it on the pile
        self.mins.append(min(x, self.mins[-1]) if self.mins else x)  #> remember the smallest so far
    def pop(self):                          #> remove the top item
        self.items.pop()                    #> take it off the pile
        self.mins.pop()                     #> and forget its smallest-so-far
    def top(self):                          #> look at the top item
        return self.items[-1]               #> the last one added
    def get_min(self):                      #> the smallest item
        return self.mins[-1]                #> already written down: one step`,
    helpers: py`
def play(ops):                              #> how the tests use your class
    s, out = MinStack(), []                 #> a fresh stack, and a list of answers
    for op, *args in ops:                   #> each instruction, like ["push", 5]
        r = getattr(s, op)(*args)           #> call that method
        if r is not None:                   #> did it answer something?
            out.append(r)                   #> record the answer
    return out                              #> all the answers`,
    demo: py`
print(play([["push", 5], ["push", 2], ["get_min"], ["pop"], ["get_min"]]))  #> [2, 5]`,
    tests: [
      [
        [[['push', -2], ['push', 0], ['push', -3], ['get_min'], ['pop'], ['top'], ['get_min']]],
        [-3, 0, -2],
      ],
      [[[['push', 5], ['get_min'], ['push', 1], ['get_min'], ['pop'], ['get_min']]], [5, 1, 5]],
      [[[['push', 2], ['push', 2], ['pop'], ['get_min']]], [2]],
    ],
    gremlins: [
      [
        'the same value three times',
        [[['push', 1], ['push', 1], ['push', 1], ['pop'], ['get_min']]],
        [1],
      ],
      ['negative then positive', [[['push', 3], ['push', -1], ['top'], ['pop'], ['top']]], [-1, 3]],
      ['a zero', [[['push', 0], ['get_min']]], [0]],
    ],
    setup: py`
def make_input(n):
    return [["push", n - i] for i in range(n)] + [["get_min"]] * n`,
    call: 'play(make_input(n))',
    target: 'O(n)',
    big: 30000,
    hints: [
      '`min(self.items)` looks through the whole pile every time someone asks.',
      'When you push, you already know the smallest item so far. Write it down next to the new item.',
      'Keep a second list `mins`. On push, append `min(x, mins[-1])`; on pop, pop both; `get_min` returns `mins[-1]`.',
    ],
    scale: {
      text: 'Paying a little extra memory to answer instantly is the most common trade in real systems. Trading engines keep “best price so far” right next to each order for the same reason.',
    },
  },
  {
    id: 'lru',
    st: 'design',
    tier: 'boss',
    title: 'LRU cache',
    lc: [146, 'lru-cache'],
    hook: 'A cache that forgets whatever was used longest ago.',
    md: 'Build a cache with room for `capacity` items. `get(key)` returns the value (or `-1`), `put(key, value)` stores it, and when the cache is full it forgets the **least recently used** item. Both must be fast.',
    fn: 'play',
    startWorks: true,
    start: py`
class LRUCache:                             #> a cache that forgets the least recently used item
    def __init__(self, capacity):           #> created with a size limit
        self.capacity = capacity            #> how many items fit
        self.data = {}                      #> key → value
        self.order = []                     #> keys, least recently used first
    def get(self, key):                     #> read a key
        if key not in self.data:            #> not in the cache?
            return -1                       #> LeetCode's "missing" answer
        self.order.remove(key)              #> find the key in the line (a hidden scan!)
        self.order.append(key)              #> move it to the back: just used
        return self.data[key]               #> its value
    def put(self, key, value):              #> store a key
        if key in self.data:                #> already there?
            self.order.remove(key)          #> take it out of the line (another scan)
        elif len(self.data) == self.capacity:  #> full?
            oldest = self.order.pop(0)      #> the least recently used key (shuffles everything)
            del self.data[oldest]           #> forget it
        self.data[key] = value              #> store the value
        self.order.append(key)              #> it's the most recent now`,
    fast: py`
from collections import OrderedDict         #> a dict that remembers order and can reorder in one step

class LRUCache:                             #> a cache that forgets the least recently used item
    def __init__(self, capacity):           #> created with a size limit
        self.capacity = capacity            #> how many items fit
        self.data = OrderedDict()           #> key → value, least recently used first
    def get(self, key):                     #> read a key
        if key not in self.data:            #> not in the cache?
            return -1                       #> LeetCode's "missing" answer
        self.data.move_to_end(key)          #> just used: move it to the back, in one step
        return self.data[key]               #> its value
    def put(self, key, value):              #> store a key
        if key in self.data:                #> already there?
            self.data.move_to_end(key)      #> it's the most recent now
        self.data[key] = value              #> store the value
        if len(self.data) > self.capacity:  #> too many?
            self.data.popitem(last=False)   #> forget the least recently used, in one step`,
    helpers: py`
def play(capacity, ops):                    #> how the tests use your class
    cache, out = LRUCache(capacity), []     #> a fresh cache, and a list of answers
    for op, *args in ops:                   #> each instruction, like ["put", 1, 1]
        r = getattr(cache, op)(*args)       #> call that method
        if r is not None:                   #> did it answer something?
            out.append(r)                   #> record the answer
    return out                              #> all the answers`,
    demo: py`
print(play(2, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2]]))  #> [1, -1]: 2 was forgotten`,
    tests: [
      [
        [
          2,
          [
            ['put', 1, 1],
            ['put', 2, 2],
            ['get', 1],
            ['put', 3, 3],
            ['get', 2],
            ['put', 4, 4],
            ['get', 1],
            ['get', 3],
            ['get', 4],
          ],
        ],
        [1, -1, -1, 3, 4],
      ],
      [
        [
          1,
          [
            ['put', 1, 1],
            ['put', 2, 2],
            ['get', 1],
            ['get', 2],
          ],
        ],
        [-1, 2],
      ],
      [[2, [['get', 5]]], [-1]],
    ],
    gremlins: [
      [
        'updating a key',
        [
          2,
          [
            ['put', 1, 1],
            ['put', 1, 10],
            ['get', 1],
          ],
        ],
        [10],
      ],
      [
        'an update counts as a use',
        [
          2,
          [
            ['put', 1, 1],
            ['put', 2, 2],
            ['put', 1, 5],
            ['put', 3, 3],
            ['get', 2],
            ['get', 1],
          ],
        ],
        [-1, 5],
      ],
      [
        'a read counts as a use',
        [
          3,
          [
            ['put', 1, 1],
            ['put', 2, 2],
            ['put', 3, 3],
            ['get', 1],
            ['put', 4, 4],
            ['get', 2],
            ['get', 3],
          ],
        ],
        [1, -1, 3],
      ],
    ],
    setup: py`
def make_input(n):
    return n, [["put", i, i] for i in range(n)] + [["get", i] for i in range(n - 1, -1, -1)]`,
    call: 'play(*make_input(n))',
    target: 'O(n)',
    big: 100000,
    hints: [
      '`list.remove` and `list.pop(0)` both look harmless but walk the whole line of keys.',
      'You need a dictionary that also remembers order and can move a key to the end in one step.',
      'Python’s `OrderedDict` has `move_to_end(key)` and `popitem(last=False)`. (Underneath it’s a dict plus a doubly linked list.)',
    ],
    scale: {
      text: 'Every big website has an LRU-style cache in front of its database. Redis, used by millions of apps, doesn’t track exact order (too much memory); it samples a few keys and evicts the oldest of them.',
      idea: 'lru',
      real: {
        label: 'Python’s own lru_cache',
        url: 'https://github.com/python/cpython/blob/main/Lib/functools.py',
      },
    },
  },
];

// ─────────────────────────────────────────────── building lessons
const parse = (src = '') =>
  !src.trim()
    ? []
    : src
        .replace(/^\n+/, '')
        .replace(/\s+$/, '')
        .split('\n')
        .map((l) => {
          const m = /\s+#>\s?(.*)$/.exec(l);
          return m ? [l.slice(0, m.index).replace(/\s+$/, ''), m[1]] : [l.replace(/\s+$/, ''), ''];
        });
const join = (...parts) => {
  const out = [];
  parts
    .filter((p) => p?.length)
    .forEach((p) => {
      if (out.length) out.push(['', '']);
      out.push(...p);
    });
  return out;
};

// puzzles from installed content packs (src/packs.js) live alongside the built-in ones
export const COMMUNITY = {
  id: 'community',
  name: 'From your packs',
  motto: 'Puzzles other people wrote',
  like: 'A shelf of puzzles shared by teachers and friends, checked the same way as the built-in ones.',
  art: 'beyond',
  term: {
    term: 'content pack',
    plain: 'a file of puzzles, paths or ideas that anyone can write and share with Bento',
    like: 'a mixtape of lessons',
  },
};
let EXTRA = [];
export const setPackPuzzles = (list) => {
  EXTRA = Array.isArray(list) ? list : [];
};
export const allPuzzles = () => (EXTRA.length ? [...PUZZLES, ...EXTRA] : PUZZLES);
export const allStations = () =>
  EXTRA.some((p) => p.st === 'community') ? [...STATIONS, COMMUNITY] : STATIONS;
export const stationOf = (p) => STATIONS.find((s) => s.id === p.st) || COMMUNITY;
export const puzzleById = (id) =>
  PUZZLES.find((p) => p.id === id) || EXTRA.find((p) => p.id === id);

// The parts of a puzzle's code: [code, english] pairs
export function codeParts(p, which = 'start') {
  const body = which === 'blank' ? blankOf(p) : parse(which === 'fast' ? p.fast : p.start);
  return join(body, parse(p.helpers), parse(p.demo));
}
// LeetCode mode: just the signatures
export function blankOf(p) {
  const out = [];
  parse(p.start).forEach(([c, e]) => {
    if (/^\s*(from|import)\s/.test(c)) return;
    const m = /^(\s*)(def|class)\s/.exec(c);
    if (!m) return;
    out.push([c, e]);
    if (m[2] === 'def') out.push([`${m[1]}    pass  # your code here`, 'your code goes here']);
  });
  return out;
}
export const codeOf = (parts) => parts.map((x) => x[0]).join('\n');
export const englishMap = (parts) =>
  Object.fromEntries(parts.filter(([c, e]) => c.trim() && e).map(([c, e]) => [c.trim(), e]));

export function puzzleLesson(p) {
  const s = stationOf(p);
  const parts = codeParts(p, 'start');
  const n = parse(p.start).length;
  const story = [
    { t: 'p', md: p.md },
    ...(p.fun ? [{ t: 'p', md: `*${p.fun}*` }] : []),
    { t: 'term', ...s.term },
    { t: 'h', text: p.startWorks ? 'The obvious way' : 'Your move' },
    {
      t: 'p',
      md: p.startWorks
        ? `[[1-${n}|The code in the editor]] already works: open **Tests** and press **Run tests**. Then press **Check** above to race it on bigger and bigger inputs, and make it scale.`
        : `[[1-${n}|The code in the editor]] isn’t finished yet. Fill it in until the **Tests** go green, then press **Check** above.`,
    },
  ];
  return {
    id: `pz-${p.id}`,
    q: p.title,
    mode: 'challenge',
    lang: 'python',
    level: 'student',
    status: 'done',
    error: null,
    builtin: true,
    title: p.title,
    kicker: `puzzle · ${s.name}`,
    concepts: [s.term.term],
    story,
    code: codeOf(parts),
    file: `${p.id}.py`,
    pseudo: parts.map((x) => x[1]),
    notes: [],
    growth: null,
    tests: { t: 'tests', fn: p.fn, cases: p.tests.map(([args, expect]) => ({ args, expect })) },
    hints: p.hints,
    steps: [],
    twin: null,
    work: null,
    context: null,
    puzzle: p.id,
    createdAt: Date.now(),
  };
}

// ─────────────────────────────────────────────── how it scales
// Classes and how to extrapolate them
const GROWTH = {
  'O(1)': () => 1,
  'O(log n)': (n) => Math.log2(Math.max(2, n)),
  'O(n)': (n) => n,
  'O(n log n)': (n) => n * Math.log2(Math.max(2, n)),
  'O(n²)': (n) => n * n,
  'O(n³)': (n) => n * n * n,
};
export const tierOf = (label) =>
  /2ⁿ|n!/.test(label)
    ? 4
    : /n³/.test(label)
      ? 3
      : /n²/.test(label)
        ? 2
        : /O\(n( log n)?\)/.test(label)
          ? 1
          : 0;

// pts: [[n, seconds per call]] from the worker. Returns { label, tier, k, base?, at(N) }
export function fitScale(pts, target = 'O(n)') {
  if (!pts || pts.length < 2) return null;
  const linear = pts.length > 2 && pts[1][0] - pts[0][0] === pts[2][0] - pts[1][0];
  let use = pts.filter(([, t]) => t > 4e-5);
  if (use.length < 3) use = pts;
  use = use.slice(-4); // the biggest sizes show the true shape; small ones are mostly fixed costs
  const [n0, t0] = pts[pts.length - 1];
  if (linear && use.length >= 2) {
    const a = use[0],
      b = use[use.length - 1];
    const base = Math.pow(b[1] / Math.max(a[1], 1e-9), 1 / Math.max(1, b[0] - a[0]));
    if (base > 1.22) {
      const label = tierOf(target) === 4 ? target : 'O(2ⁿ)';
      return { label, tier: 4, base, at: (N) => t0 * Math.pow(base, N - n0) };
    }
  }
  // small sizes stepped one by one (4, 6, 8…): the only question there is "exponential or not",
  // and microsecond timings can't tell O(n) from O(n²), so report the target rather than noise
  if (linear && GROWTH[target])
    return {
      label: target,
      tier: tierOf(target),
      k: null,
      at: (N) => (t0 * GROWTH[target](N)) / GROWTH[target](n0),
    };
  // the median of every pairwise slope (Theil–Sen): one hiccup in one measurement can't swing it
  const sl = [];
  for (let i = 0; i < use.length; i++)
    for (let j = i + 1; j < use.length; j++)
      sl.push(
        Math.log(Math.max(use[j][1], 1e-9) / Math.max(use[i][1], 1e-9)) /
          Math.log(use[j][0] / use[i][0]),
      );
  sl.sort((a, b) => a - b);
  const k =
    sl.length % 2 ? sl[(sl.length - 1) / 2] : (sl[sl.length / 2 - 1] + sl[sl.length / 2]) / 2;
  // generous bands: O(n log n) code bends up to ~1.45 at big sizes (memory effects); real O(n²) settles near 2
  let tier = k < 0.5 ? 0 : k < 1.7 ? 1 : k < 2.6 ? 2 : 3;
  // never claim better than the target: at small sizes fixed costs hide the real shape
  if (tier < tierOf(target) && GROWTH[target]) tier = tierOf(target);
  let label =
    tier === tierOf(target)
      ? target
      : ['O(log n)', k < 1.15 ? 'O(n)' : 'O(n log n)', 'O(n²)', 'O(n³)'][tier];
  if (!GROWTH[label]) label = ['O(log n)', 'O(n)', 'O(n²)', 'O(n³)'][tier];
  return { label, tier, k, at: (N) => (t0 * GROWTH[label](N)) / GROWTH[label](n0) };
}

export const DEFAULT_RUNGS = [
  [10, '✋', 'a handful'],
  [1000, '🏫', 'a school'],
  [1e6, '🏙', 'a big city'],
  [1e9, '🌍', 'a continent'],
];

const YEAR = 365.25 * 86400;
export function humanTime(s) {
  if (!isFinite(s) || s > 13.8e9 * YEAR)
    return { t: 'longer than the universe’s age', e: '🌌', c: 5 };
  if (s < 1e-3) return { t: 'instant', e: '⚡', c: 0 };
  if (s < 1) return { t: `${Math.round(s * 1000)} ms`, e: '⚡', c: s < 0.1 ? 0 : 1 };
  if (s < 60) return { t: `${s < 10 ? s.toFixed(1) : Math.round(s)} s`, e: '⏳', c: 2 };
  if (s < 3600) return { t: `${Math.round(s / 60)} min`, e: '☕', c: 2 };
  const pl = (v, w) => `${v} ${w}${v === '1' || v === 1 ? '' : 's'}`;
  if (s < 86400) return { t: pl(+(s / 3600).toFixed(s < 36000 ? 1 : 0), 'hour'), e: '🌙', c: 3 };
  if (s < YEAR) return { t: pl(Math.round(s / 86400), 'day'), e: '📅', c: 3 };
  const y = s / YEAR;
  if (y < 1e3) return { t: pl(Math.round(y), 'year'), e: '🦕', c: 4 };
  if (y < 1e6)
    return { t: `${Math.round(y / 1e3).toLocaleString()} thousand years`, e: '🦕', c: 4 };
  if (y < 1e9) return { t: `${Math.round(y / 1e6).toLocaleString()} million years`, e: '🦕', c: 5 };
  return { t: `${(y / 1e9).toFixed(1)} billion years`, e: '🌌', c: 5 };
}
export const fmtN = (n) =>
  n >= 1e9 ? `${n / 1e9} billion` : n >= 1e6 ? `${n / 1e6} million` : n.toLocaleString();
