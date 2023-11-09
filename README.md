Usage:

```sh
# create a file with the output of the list of svc
$ kubectl -n rococo get svc |grep ClusterIP|grep validator | awk {'print $1}' > list.txt
# then clean up the port fw (just in case :))
$ ps au |grep port-for| grep ":9944" |grep -v grep  |awk '{print $2}' | xargs kill -9
# and then run the script
$ node index.mjs list.txt
```