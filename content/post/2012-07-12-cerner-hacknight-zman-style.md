---
title: 'Cerner Hacknight: ZMan Style'
date: '2012-07-12T09:10:00-05:00'
slug: cerner-hacknight-zman-style
draft: false
---
## What's Hacknight?

Probably one of the best ideas to occur at Cerner.  First and foremost, It's a place for Cerner people to get together and have fun.  We gather together one night a week at innovations campus and play around with technology: programming skills not required.  I am a developer, so I enjoy getting to play around with different technologies from a coding standpoint.  However, @bergerhofer came along and actually gave me some mockups for the zmanapp that I've been working on at Hacknights.

## What's the Zman app

### History

Well, you'll need some history first.  There is a great restaurant in KC known as Oklahoma Joe's BBQ.  As a culinary master, OK Joe's came up with a great sandwich: the Zman.  At Cerner we often like to place bets or feel like someone should owe something for committing a wrong.  Money is too boring, so we settle up with the zman.  Our currency of choice is:



### Purpose

The zmanapp is a pretty simple app.  You login with your twitter account and enter the number of zmans you owe or repay a zman debt.  It's that simple.  Going forward, in hacknights to come, I plan to add more features.  These can be voted on at trello

### Tech

The zmanapp uses a pretty standard webstack for now.   The core programming language is Python using the Django web framework.  Past that I chose to use Twitter Bootstrap to help on the front end as well as JQuery.  The site is currently up at http://zmanapp.com.

I used DNSimple to register my domain, and do some redirection.  You'll notice that http://www.zmanapp.com goes to http://zmanapp.com, and as a bonus the same is true for z-manapp.com.   I am also using DNSimple to point http://zmanapp.com at a Heroku box: http://pure-light-4939.herokuapp.com/.

Heroku is a cool place that will host your site for you, for free.  Of course as your site gets bigger the free tier will not be sufficient to support lots of users, they have to make money somehow.  It is a great place to develop.

I house my code in a git repo  located at https://github.com/garrypolley/zmanapp-public .  I use a git repo because it makes it really easy to deploy to heroku.  I run one command:  git push heroku master.   After running that command my code gets pushed out and deployed to http://zmanapp.com,  no fuss.

### How to use it

If you want to play around with your own zmanapp it's pretty easy.  Make sure you take a look at Django-Social-Auth in order to get the twitter stuff set up correctly.  After that fork/checkout the git repo linked above.  Go and create a heroku account and get setup.  Once you're setup with heroku on your local git repo run the git push heroku master, and you'll have an app deployed to a url that heroku will give you.   You can setup with DNSimple but that costs money.  You can rename your heroku app to have a better url, but it will still be at a http://SOME-NAME.herokuapp.com/, however, this is free so it's better if you don't want to spend money.

Do it

Go out to zmanapp.com and sign-in.  Your account is then create so you can start giving and receiving zmans.  Do it, it's fun.

# UPDATE

This application is still on github, but the web site has been shutdown.
