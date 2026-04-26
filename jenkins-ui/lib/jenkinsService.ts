import axios, { AxiosInstance } from 'axios';

export interface JenkinsConfig {
  url: string;
  username: string;
  token: string;
}

export interface BuildParameter {
  name: string;
  value: string;
}

export interface JobParameter {
  name: string;
  type: string;
  defaultValue?: any;
  description?: string;
  choices?: string[];
}

export interface BuildInfo {
  number: number;
  result: string | null;
  building: boolean;
  duration: number;
  timestamp: number;
  url: string;
  displayName: string;
}

export interface JobInfo {
  name: string;
  url: string;
  color: string;
  lastBuild: BuildInfo | null;
  builds: BuildInfo[];
  property?: Array<{
    _class?: string;
    parameterDefinitions?: Array<{
      _class: string;
      name: string;
      description: string;
      defaultParameterValue?: {
        value: any;
      };
      choices?: string[];
      type?: string;
    }>;
  }>;
}

class JenkinsService {
  private client: AxiosInstance;
  private config: JenkinsConfig;

  constructor(config: JenkinsConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.url,
      auth: {
        username: config.username,
        password: config.token,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Convert "folder/jobName" → "/job/folder/job/jobName" for Jenkins API
  private toJobPath(jobName: string): string {
    return jobName.split('/').map(seg => `job/${encodeURIComponent(seg)}`).join('/');
  }

  /**
   * Get list of all jobs, including jobs nested inside folders
   */
  async getJobs(): Promise<JobInfo[]> {
    try {
      const jobTree = 'name,url,color,lastBuild[number,result,building,duration,timestamp,url,displayName]';
      const response = await this.client.get('/api/json', {
        params: {
          tree: `jobs[${jobTree},jobs[${jobTree}]]`,
        },
      });

      const flatten = (jobs: any[], prefix = ''): JobInfo[] =>
        jobs.flatMap((j) => {
          const fullName = prefix ? `${prefix}/${j.name}` : j.name;
          if (j.jobs && j.jobs.length > 0) {
            // Folder — recurse, skip the folder itself
            return flatten(j.jobs, fullName);
          }
          return [{ ...j, name: fullName }];
        });

      return flatten(response.data.jobs || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      throw error;
    }
  }

  /**
   * Get specific job details with parameters
   */
  async getJob(jobName: string): Promise<JobInfo> {
    try {
      const response = await this.client.get(`/${this.toJobPath(jobName)}/api/json`, {
        params: {
          tree: 'name,url,color,lastBuild[number,result,building,duration,timestamp,url,displayName],builds[number,result,building,duration,timestamp,url,displayName],property[parameterDefinitions[name,type,description,defaultParameterValue[value],choices]]',
        },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching job ${jobName}:`, error);
      throw error;
    }
  }

  /**
   * Extract parameters from job info
   */
  extractParameters(job: JobInfo): JobParameter[] {
    const parameters: JobParameter[] = [];
    
    // Known base64file parameters (Jenkins bug workaround)
    const base64FileParams = ['APP_ZIP', 'FILE', 'UPLOAD'];
    
    if (job.property) {
      for (const prop of job.property) {
        if (prop.parameterDefinitions) {
          for (const param of prop.parameterDefinitions) {
            let paramType = this.getParameterType(param._class);
            
            // BUGFIX: Jenkins base64File parameters sometimes don't return correct type
            // Check if parameter name matches known file upload parameters
            if (base64FileParams.some(name => param.name.toUpperCase().includes(name))) {
              paramType = 'base64file';
            }
            
            const parameter: JobParameter = {
              name: param.name,
              type: paramType,
              description: param.description,
            };

            // Set default value
            if (param.defaultParameterValue?.value !== undefined) {
              parameter.defaultValue = param.defaultParameterValue.value;
            }

            // Add choices for choice parameters
            if (param.choices && param.choices.length > 0) {
              parameter.choices = param.choices;
              parameter.defaultValue = parameter.defaultValue || param.choices[0];
            }

            parameters.push(parameter);
          }
        }
      }
    }

    return parameters;
  }

  /**
   * Convert Jenkins parameter class to readable type
   */
  private getParameterType(className: string): string {
    const typeMap: { [key: string]: string } = {
      'hudson.model.StringParameterDefinition': 'string',
      'hudson.model.TextParameterDefinition': 'text',
      'hudson.model.BooleanParameterDefinition': 'boolean',
      'hudson.model.ChoiceParameterDefinition': 'choice',
      'hudson.model.PasswordParameterDefinition': 'password',
      'hudson.model.FileParameterDefinition': 'file',
      'hudson.plugins.base64parameter.Base64FileParameterDefinition': 'base64file',
      'Base64FileParameterDefinition': 'base64file',
    };

    // Check exact match first
    if (typeMap[className]) {
      return typeMap[className];
    }
    
    // Check if class name contains 'Base64' or 'File'
    if (className.toLowerCase().includes('base64') || className.toLowerCase().includes('fileparameter')) {
      return 'base64file';
    }

    return 'string';
  }

  /**
   * Trigger a build
   */
  async triggerBuild(jobName: string, parameters?: BuildParameter[]): Promise<{ queueUrl: string }> {
    try {
      const jobPath = this.toJobPath(jobName);

      // If no parameters, use simple build endpoint
      if (!parameters || parameters.length === 0) {
        const response = await this.client.post(`/${jobPath}/build`);
        const queueUrl = response.headers.location || '';
        return { queueUrl };
      }

      // Jenkins buildWithParameters expects URL query parameters
      // File parameters need special handling
      const hasFileParam = parameters.some(p =>
        p.name === 'APP_ZIP' ||
        p.name.toUpperCase().includes('FILE') ||
        p.name.toUpperCase().includes('ZIP')
      );

      if (hasFileParam) {
        // For file parameters, use multipart/form-data
        const FormData = require('form-data');
        const formData = new FormData();

        // Add all parameters to form data
        parameters.forEach(param => {
          const isFile = param.name === 'APP_ZIP' ||
                        param.name.toUpperCase().includes('FILE') ||
                        param.name.toUpperCase().includes('ZIP');

          if (isFile && param.value) {
            // Convert base64 to buffer and add as file
            const buffer = Buffer.from(param.value, 'base64');
            formData.append(param.name, buffer, {
              filename: `${param.name}.zip`,
              contentType: 'application/zip'
            });
          } else {
            // Add as regular form field
            formData.append(param.name, param.value);
          }
        });

        console.log('Triggering build with file upload:', jobName);

        const response = await this.client.post(
          `/${jobPath}/buildWithParameters`,
          formData,
          {
            headers: {
              ...formData.getHeaders()
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
          }
        );

        const queueUrl = response.headers.location || '';
        return { queueUrl };
      } else {
        // For non-file parameters, use URL query params
        const params: Record<string, string> = {};
        parameters.forEach(param => {
          params[param.name] = param.value;
        });

        console.log('Triggering build with parameters:', jobName, params);

        const response = await this.client.post(
          `/${jobPath}/buildWithParameters`,
          null,
          {
            params,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        const queueUrl = response.headers.location || '';
        return { queueUrl };
      }
    } catch (error: any) {
      console.error(`Error triggering build for ${jobName}:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
        console.error('Response headers:', error.response.headers);
      }
      throw error;
    }
  }

  /**
   * Get build details
   */
  async getBuild(jobName: string, buildNumber: number): Promise<BuildInfo> {
    try {
      const response = await this.client.get(`/${this.toJobPath(jobName)}/${buildNumber}/api/json`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching build ${buildNumber} for ${jobName}:`, error);
      throw error;
    }
  }

  /**
   * Get build console output
   */
  async getConsoleOutput(jobName: string, buildNumber: number): Promise<string> {
    try {
      const response = await this.client.get(`/${this.toJobPath(jobName)}/${buildNumber}/consoleText`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching console output for ${jobName}/${buildNumber}:`, error);
      throw error;
    }
  }

  /**
   * Stop a build
   */
  async stopBuild(jobName: string, buildNumber: number): Promise<void> {
    try {
      await this.client.post(`/${this.toJobPath(jobName)}/${buildNumber}/stop`);
    } catch (error) {
      console.error(`Error stopping build ${buildNumber} for ${jobName}:`, error);
      throw error;
    }
  }

  /**
   * Get pipeline stages for a build
   */
  async getPipelineStages(jobName: string, buildNumber: number): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/${this.toJobPath(jobName)}/${buildNumber}/wfapi/describe`
      );
      return response.data.stages || [];
    } catch (error) {
      console.error(`Error fetching pipeline stages for ${jobName}/${buildNumber}:`, error);
      // Return empty array if pipeline API not available
      return [];
    }
  }

  /**
   * Get queue item details
   */
  async getQueueItem(queueId: number): Promise<any> {
    try {
      const response = await this.client.get(`/queue/item/${queueId}/api/json`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching queue item ${queueId}:`, error);
      throw error;
    }
  }
}

export default JenkinsService;
