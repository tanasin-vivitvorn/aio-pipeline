// Seed job: create a folder + POC Pipeline for each LDAP user
def users = ['admin', 'dev']
def pipelineScript = new File('/etc/jenkins/Jenkinsfie').text

users.each { username ->
    folder(username) {
        displayName(username)
        description("CI/CD workspace for ${username}")
    }

    pipelineJob("${username}/POC Pipeline") {
        description("Main CI/CD pipeline for ${username}")
        definition {
            cps {
                script(pipelineScript)
                sandbox(true)
            }
        }
    }
}
