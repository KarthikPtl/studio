
"use client";

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { UploadCloud, X, Camera, Video, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'; // Import Alert components
import { useToast } from '@/hooks/use-toast'; // Import useToast

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
  setFile: (file: File | null) => void;
  className?: string;
}

export function ImageUploader({ onImageUpload, imageUrl, setImageUrl, setFile, className }: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null); // Tri-state: null (initial), true, false
  const [isCapturing, setIsCapturing] = useState(false); // To disable buttons during capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for canvas
  const streamRef = useRef<MediaStream | null>(null); // Store the stream to stop it later
  const { toast } = useToast(); // Initialize toast

  // Request Camera Permission
  useEffect(() => {
    if (!showCamera) {
        // Stop camera if user switches back to upload
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            setHasCameraPermission(null); // Reset permission state
            console.log("Camera stream stopped.");
        }
        return;
    }

    const getCameraPermission = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Camera API not supported.');
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Not Supported',
          description: 'Your browser does not support camera access.',
        });
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); // Prefer rear camera
        streamRef.current = stream; // Store stream
        setHasCameraPermission(true);
        console.log("Camera permission granted.");

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => {
            console.error("Error playing video stream:", err);
            // Handle autoplay error (rare but possible)
            toast({
                variant: 'destructive',
                title: 'Video Playback Error',
                description: 'Could not start the camera feed.',
            });
          });
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        toast({
          variant: 'destructive',
          title: 'Camera Access Denied',
          description: 'Please enable camera permissions in your browser settings.',
        });
      }
    };

    getCameraPermission();

    // Cleanup function to stop the stream when the component unmounts or showCamera becomes false
    return () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            console.log("Camera stream stopped on cleanup.");
        }
    };
  }, [showCamera, toast]); // Dependency on showCamera

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setIsDragging(false);
      setShowCamera(false); // Ensure camera is hidden on drop
      if (acceptedFiles && acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        if (imageUrl && imageUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageUrl);
        }
        const newImageUrl = URL.createObjectURL(file);
        setImageUrl(newImageUrl);
        setFile(file);
        onImageUpload(file);
      }
    },
    [imageUrl, onImageUpload, setImageUrl, setFile]
  );

  // Cleanup temporary URL
  useEffect(() => {
     return () => {
       if (imageUrl && imageUrl.startsWith('blob:')) {
         URL.revokeObjectURL(imageUrl);
       }
     };
   }, [imageUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    multiple: false,
    noClick: showCamera, // Disable click opening file dialog when camera is active
    noKeyboard: showCamera,
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
  });

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (imageUrl && imageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(null);
    setFile(null);
    setShowCamera(false); // Ensure camera is off when clearing
  };

  const toggleCamera = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering dropzone
      handleClear(); // Clear existing image when switching modes
      setShowCamera(prev => !prev);
      setHasCameraPermission(null); // Reset permission state on toggle
  };

  const handleCapture = useCallback(async () => {
      if (!videoRef.current || !canvasRef.current || !hasCameraPermission) {
          console.error("Cannot capture: Video, canvas, or permission missing.");
          return;
      }
      setIsCapturing(true); // Disable buttons

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
          console.error("Failed to get canvas context.");
          toast({ title: "Capture Error", description: "Could not prepare image capture.", variant: "destructive" });
          setIsCapturing(false);
          return;
      }

      // Set canvas dimensions to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame onto the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to Blob, then to File
      canvas.toBlob(async (blob) => {
          if (!blob) {
              console.error("Canvas to Blob conversion failed.");
              toast({ title: "Capture Error", description: "Failed to create image data.", variant: "destructive" });
              setIsCapturing(false);
              return;
          }

          // Create a File object
          const capturedFile = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });

          // Create a temporary URL for preview
          if (imageUrl && imageUrl.startsWith('blob:')) {
              URL.revokeObjectURL(imageUrl);
          }
          const newImageUrl = URL.createObjectURL(capturedFile);

          setImageUrl(newImageUrl);
          setFile(capturedFile);
          onImageUpload(capturedFile); // Pass the captured file
          setShowCamera(false); // Hide camera view after capture

          console.log("Image captured successfully.");
          toast({ title: "Image Captured", description: "Processing captured image..." });
          setIsCapturing(false); // Re-enable buttons

      }, 'image/png'); // Specify PNG format

  }, [hasCameraPermission, setImageUrl, setFile, onImageUpload, imageUrl, toast]);


  return (
    <Card className={cn(
      "border-2 border-dashed hover:border-primary/80 transition-colors h-full rounded-xl overflow-hidden", // Added overflow-hidden
      isDragging || isDragActive ? "border-primary bg-primary/5" : "border-border/70",
      showCamera && hasCameraPermission === false && "border-destructive", // Red border if permission denied
      className
    )}>
      <CardContent
        {...(!showCamera ? getRootProps() : {})} // Apply dropzone props only when not showing camera
        className={cn(
          "relative flex flex-col items-center justify-center p-6 min-h-[200px] text-center h-full rounded-xl",
          !showCamera && "cursor-pointer", // Only show pointer cursor for upload
          showCamera && "p-0" // Remove padding when camera is active
        )}
      >
        {/* Hidden canvas for capturing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Always render input, but it's disabled via dropzone config when camera is on */}
        <input {...getInputProps()} />

        {/* Top Buttons */}
        <div className={cn(
            "absolute top-3 right-3 z-10 flex gap-2",
            showCamera && "p-2 bg-background/70 rounded-lg" // Background for camera buttons
            )}>
          {imageUrl && !showCamera && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="bg-background/80 hover:bg-destructive/10 hover:text-destructive rounded-full h-7 w-7"
              aria-label="Clear image"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          {!imageUrl && ( // Only show toggle if no image is loaded
             <Button
               variant={showCamera ? "secondary" : "ghost"}
               size="icon"
               onClick={toggleCamera}
               className="bg-background/80 hover:bg-primary/10 hover:text-primary rounded-full h-7 w-7"
               aria-label={showCamera ? "Switch to file upload" : "Switch to camera"}
               disabled={isCapturing}
             >
               {showCamera ? <UploadCloud className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
             </Button>
          )}
        </div>

        {/* Main Content Area */}
        {showCamera ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-black rounded-xl">
            {/* Video Feed */}
            <video
                ref={videoRef}
                className="w-full h-auto max-h-[calc(100%-60px)] object-contain rounded-t-xl" // Adjust max-height to leave space for button
                autoPlay
                playsInline // Important for iOS
                muted // Mute to avoid feedback loops if microphone was enabled
                aria-label="Camera Feed"
            />
             {/* Capture Button & Permission Message */}
            <div className="w-full p-3 flex flex-col items-center justify-center bg-background rounded-b-xl">
                {hasCameraPermission === false && (
                    <Alert variant="destructive" className="mb-2 text-xs">
                      <AlertTitle>Camera Access Denied</AlertTitle>
                      <AlertDescription>
                        Enable camera permissions in browser settings.
                      </AlertDescription>
                    </Alert>
                )}
                 {hasCameraPermission === null && (
                    <div className="text-sm text-muted-foreground p-2">Requesting camera...</div>
                )}
                <Button
                  onClick={handleCapture}
                  disabled={!hasCameraPermission || isCapturing}
                  className="w-full font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm hover:shadow-md transition-all"
                  aria-label="Capture image from camera"
                >
                  {isCapturing ? 'Capturing...' : <CheckSquare className="mr-2 h-4 w-4" />}
                  {isCapturing ? 'Please wait' : 'Capture Photo'}
                </Button>
            </div>
          </div>
        ) : imageUrl ? (
          // Image Preview
          <>
            <Image
              src={imageUrl}
              alt="Uploaded Math Expression"
              width={400}
              height={200}
              className="max-h-[300px] w-auto object-contain rounded-lg shadow-md"
              data-ai-hint="math equation"
              // Ensure the image rerenders if the src changes
              key={imageUrl}
            />
            <p className="mt-4 text-sm text-muted-foreground">Drag 'n' drop or click to replace</p>
          </>
        ) : (
          // Upload Prompt
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <UploadCloud className="h-10 w-10 text-gray-400" />
            <p className="font-medium text-sm text-foreground">
              {isDragActive ? "Drop the image here..." : "Drag & drop image, or click to select"}
            </p>
            <p className="text-xs text-gray-500">Supports JPG, PNG (Max 5MB)</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

