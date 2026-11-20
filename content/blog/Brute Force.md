---
title: Brute Force
date: 2026-11-18
description: Design algorithms using the brute force method
tags:
  - algorithms
  - programming
draft: true
---
An *algorithm* is a set of step-by-step instructions for solving a problem.

When designing an algorithm, we typically evaluate it based on three core criteria:

- **Implementation speed**: How fast can we figure out and implement the algorithm ?
- **Performance**: How fast does it solve the problem, given our hardware constraints ?
- **Correctness**: Does it always produce the right answer ? how can we verify it ?

In this post, I will explain one type of algorithm which is called brute force, complete search or exhaustive search.

> It's called search since we are actually looking through all possible solutions, and keeping the right one. 

### Non-Technical Example

Problem: find the right code to a 2-digit combination lock

> [!note] Algorithm
> Try every possible combination.

- **Implementation speed**: It took us a couple of microseconds, just enough that the neurons in our brain fire up.
- **Performance**: I can try one code per second (this is my hardware), in the worst case scenario it would take me 100 seconds for the 100 possible codes.
- **Correctness**: We know that a correct code exists and trying every code guarantees that we find the correct code.

We have just implemented a complete search algorithm. Most people would call this kind of algorithm dumb, but it still gets the right answers.

The only critique is that this same algorithm grows exponentially with the number of digits we have.

| Number of digits        | 2 digits | 4 digits | 6 digits | 10 digits[^1] |
| :---------------------- | :------- | -------: | -------- | ------------- |
| **Worst Case Scenario** | ~2min    |   ~17min | ~11 days | ~317 years    |

Solving problems using brute force, happens in two step, identifying all possible solutions, navigating them.

And it's this second part that is usually not as clear as it might seem from the problem we have explored. Hopefully, not as complicated after reading this article.

> This is a post that's in progress, I just wanted to push myself to publish so that I force myself to finish it later on.


[^1]: This is exactly why most passwords require a minimum number of characters.