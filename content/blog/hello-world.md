---
title: "Hello World — First Post"
date: 2026-07-07
description: "Welcome to my blog. This is where I share what I learn, build, and think about."
tags:
  - "meta"
  - "42paris"
draft: false
---

Welcome to my corner of the internet. I'm **El Houssain Souhail**, a software engineering student at [42Paris](https://42.fr).

## Why this blog?

I started this blog to document my learning journey — from low-level C programming to distributed systems and everything in between.

> "The best way to learn is to teach." — Richard Feynman

## What to expect

- Deep dives into **systems programming** concepts
- Project breakdowns and **technical write-ups**
- Book reviews and thoughts on **software craft**

### A code example

Here's a simple C function I wrote recently:

```c
#include <unistd.h>

void	ft_putstr(char *str)
{
	while (*str)
		write(1, str++, 1);
}
```

## Obsidian Integration

This blog supports Obsidian markdown. You can write your posts in Obsidian and simply copy them to the `content/blog/` directory. Just make sure each post has the required front matter:

```yaml
---
title: "Your Post Title"
date: 2026-07-07
tags:
  - "tag1"
  - "tag2"
draft: false
---
```

That's it for now. More posts coming soon.
