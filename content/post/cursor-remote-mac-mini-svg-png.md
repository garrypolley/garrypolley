---
title: "Remote Cursor on a Mac mini (and an SVG to PNG tool)"
slug: "cursor-remote-mac-mini-svg-png"
date: 2026-08-04T10:47:30-05:00
Description: "Setting up Cursor on a Mac mini so I can prompt from iOS, then shipping a tiny SVG to PNG tool for Slack and texts"
Tags: []
Categories: []
DisableComments: false
draft: true
---

I keep running into the same tiny annoyance: I have an SVG, and I need to share it somewhere that does **not** want an SVG. Slack. Texts. Random places that happily take a PNG and shrug at vector markup.

So I wanted a stupid-simple converter. Paste the SVG (or drop a file), get a PNG, copy/download it, move on with my day. No upload to some random website. No opening Figma. Just the browser.

That little tool now lives here:

https://garrypolley.com/tool/svg-to-png/

![Tools section on garrypolley.com](/images/cursor-remote-svg-png/tools-index.png)

But the more interesting part, at least to me, is **how** I built it.

## Prompting Cursor from my phone

I've been using Cursor as a remote agent against a Mac mini I leave on at home. The pitch is pretty straightforward:

1. The Mac mini is the always-on machine with the repo, tools, git, and browser bits ready
1. I open the Cursor iOS app
1. I talk (or type) from wherever I am — a lot of my prompts start as voice-to-text on the phone
1. The agent does the local work on the mini — edits, commits, PRs, even poking at the live site

That setup changes the shape of "quick idea" work for me. I don't need to be at a desk with a full IDE open to knock out a small utility. I can notice the Slack/SVG problem, open the phone app, and just talk through what I want.

You can also run more than one agent at a time. Here's the iOS Live Activity from while I was writing this — one agent planning this post from a voice prompt, and another grinding on a side project:

![Cursor iOS Live Activity showing two agents on the Mac mini](/images/cursor-remote-svg-png/ios-live-activity-agents.png)

In this case the site prompt was basically: add a Tools section to my Hugo site, pull the old Suko solver into it, and make an in-browser SVG → PNG converter that supports paste _and_ file upload.

A bit later I had a PR, a deploy preview, and then the tool on the live site.

## Why this particular tool

The use case is boring in the best way.

Sometimes I have SVG markup — from a design export, a generated icon, whatever — and I need to drop an image into Slack or a text thread. Those surfaces are happy with screenshots and PNGs. They are not happy with raw SVG.

So the flow I wanted:

1. Copy the SVG
1. Paste it into a page on my own site
1. Convert locally in the browser
1. Download / copy the PNG
1. Paste that into Slack or Messages

Nothing leaves my machine during conversion. That mattered more than I expected once I started using it.

![SVG to PNG after converting a sample](/images/cursor-remote-svg-png/svg-to-png-converted.png)

You can paste markup or upload a `.svg` file. There's a scale control if you need a bigger raster. Then convert and download.

![Close-up of the converter UI](/images/cursor-remote-svg-png/svg-to-png-tool-closeup.png)

## The Tools section

While I was there I also gave the site a proper home for little utilities like this. There's now a **Tools** nav item:

- [SVG to PNG](/tool/svg-to-png/)
- [Suko Solver](/tool/suko-solver/) — the old newspaper puzzle solver from [this post](/2021/02/07/suko-solver/), cleaned up into the tools list

I like that pattern. Blog posts are for the story. Tools are for the thing you actually click twice a week.

## Try it here

Same converter as the Tools page, embedded below. Paste an SVG and convert it without leaving the post.

{{< svgToPng >}}

If you've got a better workflow for "I have an SVG and Slack wants a PNG," I'd love to hear it: garrympolley+svg@gmail.com
