---
title: "Suko Solver"
date: 2021-02-07T09:47:26-06:00
Description: ""
Tags: []
Categories: []
DisableComments: false
draft: false
---

On this day in 2021 I was working on my weekend ritual of solving the Suko and Cell Blocks puzzles.
I've wondered each weekend if there is a Suko puzzle. I finally wanted to check _after_ solving the puzzle
to see if there was a solver. I grabbed my phone and searched the web. The internet seems to yield no
obvious results. So here we are - I want to create a Suko solver. I'm working on this now. 

We shall see if this post updates in the next few hours with a solver on screen 🤞...

I did it -- the solution can be viewed by looking at this page source code, it's a brute force solve

I named the circles in a way that I hope is clear. If not you should see the areas populate as you fill out.


To assign colors click the colored circle to the left and then select the squares that corrspond. Very little error handling has been created.
A page refresh might be needed if it seems off.


Finally clicking solve will try to solve -- it pops up an alert if it fails for any reason

{{< sukoSolver >}}
