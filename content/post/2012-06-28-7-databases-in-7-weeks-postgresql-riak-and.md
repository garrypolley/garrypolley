---
title: '7 Databases in 7 Weeks: PostgreSQL, Riak, and Hbase'
date: '2012-06-28T14:00:00-05:00'
slug: 7-databases-in-7-weeks-postgresql-riak-and
draft: false
---
I decided to purchase this book based on a recommendation by a coworker named Tom.  I've finished up with the first 4 chapters and it has been a really good read.  I'd highly recommend this book to anyone interested in database technology, or even as a college textbook to help introduce differences among different data stores.  The writers have taken great effort in making the book both readable (it's very much like a conversation with an expert) and technical so you can truly begin to understand the different databases and the use cases they support.  

I'll give a very brief summary of each chapter I've read so far with a rating (terrible, bad, okay, good, great) and some of the caveats to getting setup since newer versions of the software have been released since the books publication.

## PostgreSQL (Good) — used ubuntu 12.04

### Summary:

I learned a good amount of information from the PostgreSQL section.  It covered some basic and advanced SQL topics as well as some cool features within PostgreSQL.  Most importantly I learned to look at RDBMS as a set theory based relation to a data is similar relation.

Coolest piece I learned about PostgreSQL was search and all its plugins.  The book walks you through a really cool exercise in getting the db to work with search (does more exact matching) and fuzzy search (approximates searches).  It points out the different caveats of each type of search algorithm, and also talks abut Levenshtein distance, which is a cool way to perform string comparison. 

### Caveats:

In order to get the book database to work out I first created it with the createdb command but then I had to run the following commands to add the needed extensions:

```sh
psql book -c "CREATE EXTENSION tablefunc"
psql book -c "CREATE EXTENSION dict_xsyn"
psql book -c "CREATE EXTENSION fuzzystrmatch"
psql book -c "CREATE EXTENSION pg_trgm"
psql book -c "CREATE EXTENSION cube"
```

## RIAK (Great) — used ubuntu 12.04

### Summary:

My opinion is pretty biased though because I already knew a good amount about SQL so that section was as exciting/enticing to read.  Riak is a key value store that allows you to do map-reduce jobs.  It's pretty cool, and really fast.  One of the cooler ways I could see it being used for would be a static content server.  That way it could serve it all from its cache instead of disk.  It would be similar to loading from a technology like memcahced but cooler, because it has a REST api to manipulate its data.  

My favorite part of the setup for Riak is that you can over load the CAP theorem, as the book tells you.  Meaning, you can fine tune reads and writes on a per request basis.  This makes it a very cool and interesting data store.  It is also very fault tolerant.   

### Caveats:

There weren't really any caveats.  Below are the commands I ran to get it up and running.

```sh
garry@garry-VirtualBox:~/riak$ dev/dev1/bin/riak start
garry@garry-VirtualBox:~/riak$ dev/dev2/bin/riak start
garry@garry-VirtualBox:~/riak$ dev/dev3/bin/riak start
garry@garry-VirtualBox:~/riak$ dev/dev2/bin/riak-admin cluster join dev1@127.0.0.1
  Success: staged join request for ‘dev2@127.0.0.1' to ‘dev1@127.0.0.1'
garry@garry-VirtualBox:~/riak$ dev/dev3/bin/riak-admin cluster join dev2@127.0.0.1
  Success: staged join request for ‘dev3@127.0.0.1' to ‘dev2@127.0.0.1'
```

## HBase (Good) — used a OSX 10.7.4

### Summary:

I was very wrong in what I thought HBase was before I read this book.  I thought it was a document store database, similar to mongodb. I could not have been more wrong.  It is a column oriented database that, on its own, only has 1 lookup key.  With that in mind, it is still a very powerful technology.

My favorite part about HBase is the default versioning.  Meaning you don't really need audit tables, because it keeps the older version around forever (defaults to 3).  It also supports Thrift (a binary protocol), so you don't have to work with heavy http traffic in a distributed system.  

### Caveats:

I had to install the following to get this to semi work, I never did get thrift to work.

* homebrew (awesome package manager for mac)
* rvm
```sh
curl -L https://get.rvm.io | bash -s stable --ruby
```
 (installs rvm, a ruby environment manager)

After following the steps in the book I did a gem install of hbase and thrift.  I had to do a gem search hbase and a gem search thrift to find the correct package.  I kept getting an error on Apache::Hadoop::Hbase::Thrift.new( protocol ) section in the thrift_example.rb, this was when I quit doing and continued reading.  I couldn't find the Apache namespace/package for ruby.

All in all this book is really good so far and I look forward to reading more.  Feel free to comment and let me know what you think of the book.  Also, if you figured out the error around the Apache namespace, that'd be really cool.  
