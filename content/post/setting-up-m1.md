---
title: "Setting Up M1"
date: 2021-03-28T10:10:58-05:00
Description: "The adventure of setting up a MacBook Air M1 laptop"
Tags: []
Categories: []
DisableComments: false
---

I have the priledge of getting to purchase an Apple MacBook Air M1. 
I'm excited to start getting the device setup and seeing how it compares
to the macbook pro I've been using the last few years. Moreover, 2 years
ago I purchased a windows Surfacebook Laptop from CostCo that has done
well, but the ergonomics are not quite for me. Therefore, I've taken
the plundge into the m1 -- with my first ever MacBook Air!

I'll add more as I continue the journey of setting up the M1.

## Applications

By default I've installed a few applications. Most of which are geared towards
software development.

1. Spotify - I need my tunes
1. VSCode - How else would I write code
1. ITerm - I like what ITerm does visually without effort

## Programming Applications

This section is more around the specific programs I've installed or changed up
to make developing software easier -- or what is required. For example, not 
everything compiles to the M1 ARM architecture out of the box. For that I've 
followed some steps to suppor the x86 architecture.

1. `brew` - this is the [hombrew install](https://brew.sh/) at `/opt/homebrew` (default on M1 now)
1. `volta` - Followed [install docs](https://docs.volta.sh/guide/) on the volta site
1. `ibrew` - to suppport x86 only brew installs [thanks diewland](https://diewland.medium.com/how-to-install-python-3-7-on-macbook-m1-87c5b0fcb3b5)
1. `python3` (Pyton 3.8) - used normal `brew install python`
1. `python3` (Python 3.7) - needed to support x86 `ibrew install python@3.7`
1. `hugo` - this was straight forward `brew install hugo`
1. `git` - installed by doing `brew install git`
1. `zshell` - install with the [random script from the internet](https://ohmyz.sh/)

## General Notes

I started using the `.zprofile`. Previously I've used the `.zshrc`. So far so good with the `.zprofile`:

```sh
eval "$(/opt/homebrew/bin/brew shellenv)"

export VOLTA_HOME=$HOME/.volta
export PATH="$VOLTA_HOME/bin:$PATH"


alias ibrew="arch -x86_64 /usr/local/bin/brew"
```

