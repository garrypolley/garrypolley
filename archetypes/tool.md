---
title: "{{ replace .Name "-" " " | title }}"
slug: "{{ replace .Name "_" "-" | lower }}"
date: {{ .Date }}
draft: true
short: ""
---
