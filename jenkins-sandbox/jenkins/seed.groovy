// Seed job: create a folder + pipelines for each LDAP user
def users           = ['admin', 'dev']
def pipelineScript  = new File('/etc/jenkins/Jenkinsfie').text
def winScanScript   = new File('/etc/jenkins/Jenkinsfie-winscan').text

users.each { username ->
    folder(username) {
        displayName(username)
        description("CI/CD workspace for ${username}")
    }

    pipelineJob("${username}/POC Pipeline") {
        description("Main CI/CD pipeline — deploy, scan, and test web/server applications")
        definition {
            cps {
                script(pipelineScript)
                sandbox(true)
            }
        }
    }

    pipelineJob("${username}/Windows App Scan") {
        description("Virus scan (YARA + YARAify) for Windows executables — uploads to Nexus only if clean")
        definition {
            cps {
                script(winScanScript)
                sandbox(true)
            }
        }
    }
}
