ALPR is automatic licence plate recognition application that is implemented for Turkish plate numbers specifically.
This application will be used in a car parking area. 
Main functionalities:
- Automatic plate recognition
- Once the plate is recognized (at entrance), there will be an API call to our BE server to register plate number, details (entrance time, status ecc...)
  - At this stage, we  actually register everything we may need later to our database
  - The software should not send the same plate number twice
  - The recognition algorithm should be able to recognize the plate number with 90% accuracy
  - If the plate number is not recognized, we will allow user/admin to enter the plate number manually on our interface
- Once the plate is recognized (at exit), there will be an API call to our BE server to update some data such as status, exit time
  - At this stage, we update the info and calculate the total time spent in the parking area, and the total price that user needs to pay
  - To understand total price, we will have look up table for price schema
  - The software should not send the same plate number twice
  - The recognition algorithm should be able to recognize the plate number with 90% accuracy
  - If the plate number is not recognized, we will allow user/admin to enter the plate number manually on our interface

- Once the payment is done, there will be an API call to our BE server to update payment status
  - This will be managed by Administration panel - not online payment in MVP