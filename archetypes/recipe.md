---
title: "{{ replace .Name "-" " " | title }}"
slug: "{{ replace .Name "_" "-" | lower }}"
date: {{ .Date }}
draft: true
ingredients: [
    {
        name: "NAME",
        amount: "AMOUNT"
    }
]
steps: [
    "Step "
]
image: ""
short: ""
---
