export abstract class Logger {
    //soruce http://www.beefycode.com/post/Log4Net-Tutorial-pt-1-Getting-Started.aspx
    
    public static log(file:string,log_level:string, task: string, message: any) {
        console.log(`${new Date().toISOString()} - ${log_level} - ${file} - ${task} - ${message}`)
    }

    /**
     * Statements that describe non-fatal errors in the application; this level is used quite often for logging handled exceptions
     * @param {string} task Place from the log is displayes. Can be a function name or the full path of the file who contain the code 
     * @param {string} message The message to display 
     */
    public static logError(file:string,task: string, message: any) {
        Logger.log(file,"ERROR",task,message)
        // console.log(`${new Date().toISOString()} - ${user} - ERROR - ${file} - ${task} - ${message}`)
    }

    /**
     * Fine-grained statements concerning program state, typically used for debugging 
     * @param {string} task Place from the log is displayes. Can be a function name or the full path of the file who contain the code 
     * @param {string} message The message to display 
     */
    public static logDebug(file:string,  task: string, message: any) {
        Logger.log(file,"DEBUG",task,message)
        // console.log(`${new Date().toISOString()} - ${user} - DEBUG - ${file} - ${task} - ${message}`)
    }

    /**
     * Statements that describe potentially harmful events or states in the program 
     * @param {string} task Place from the log is displayes. Can be a function name or the full path of the file who contain the code 
     * @param {string} message The message to display 
     */
    public static logWarn(file:string, task: string, message: any) {
        Logger.log(file,"WARN",task,message)
        // console.log(`${new Date().toISOString()} - ${user} - WARN - ${file} - ${task} - ${message}`)
    }
    
    /**
     * Statements representing the most severe of error conditions, assumedly resulting in program termination.
     * @param {string} task Place from the log is displayes. Can be a function name or the full path of the file who contain the code 
     * @param {string} message The message to display 
     */
    public static logFatal(file:string,  task: string, message: any) {
        Logger.log(file,"FATAL",task,message)
        // console.log(`${new Date().toISOString()} - ${user} - FATAL - ${file} - ${task} - ${message}`)
    }

    /**
     * Informational statements concerning program state, representing program events or behavior tracking; 
     * @param {string} task Place from the log is displayes. Can be a function name or the full path of the file who contain the code 
     * @param {string} message The message to display 
     */
    public static logInfo(file:string, task: string, message: string) {
        Logger.log(file,"INFO",task,message)
        // console.log(`${new Date().toISOString()} - ${user} - INFO - ${file} - ${task} - ${message}`)
    }
}
