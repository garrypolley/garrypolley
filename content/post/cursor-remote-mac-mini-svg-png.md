---
title: "Remote Cursor on a Mac mini (and an SVG to PNG tool)"
slug: "cursor-remote-mac-mini-svg-png"
date: 2026-08-04T10:47:30-05:00
Description: "Using Cursor on a Mac mini from my phone, and a small SVG to PNG tool"
Tags: []
Categories: []
DisableComments: false
draft: true
---

Quick note up front: I prompted Cursor to take all the screenshots of the site/pages locally for this post. That is awesome.

I keep needing to share an SVG in places that won't take an SVG. Slack. Text messages. Stuff like that. They want a PNG.

So I made a page where I can paste the SVG (or pick a file), convert it in the browser, and download the PNG.

https://garrypolley.com/tool/svg-to-png/

![Tools section on garrypolley.com](/images/cursor-remote-svg-png/tools-index.png)

What I actually want to write about though is how I built it.

I've got a Mac mini at home that stays on. Cursor runs there. I use the Cursor app on my phone, often with voice to text, and tell it what I want. The agent works on the mini — editing files, making commits, opening PRs, that kind of thing.

I don't have to sit down at a computer to do a small site change. I can just talk to the phone.

You can run more than one agent at once too. Here's what that looked like on my phone while I was working on this. One agent is this post (from a voice prompt). The other is a side project:

![Cursor iOS Live Activity showing two agents on the Mac mini](/images/cursor-remote-svg-png/ios-live-activity-agents.png)

For the site I asked it to add a Tools section, move the old Suko solver over there, and build an SVG to PNG converter that works with paste or a file upload. A while later it was up.

The converter itself is plain on purpose. Paste or upload, hit convert, download the PNG. It all stays in the browser.

![SVG to PNG after converting a sample](/images/cursor-remote-svg-png/svg-to-png-converted.png)

![Close-up of the converter UI](/images/cursor-remote-svg-png/svg-to-png-tool-closeup.png)

There's a Tools page now with:

- [SVG to PNG](/tool/svg-to-png/)
- [Suko Solver](/tool/suko-solver/) from [this older post](/2021/02/07/suko-solver/)

Try the converter below if you want:

{{< svgToPng >}}

Let me know what you think: garrympolley+svg@gmail.com
