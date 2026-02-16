import AWS from 'aws-sdk';

AWS.config({ region: "ap-south-1" });

const s3 = new AWS.S3();


const S_BUCKET = "relic-version-control-bucket"

export { s3, S_BUCKET };